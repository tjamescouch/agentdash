import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import nacl from 'tweetnacl';
import tweetnaclUtil from 'tweetnacl-util';
const { encodeBase64, decodeBase64 } = tweetnaclUtil;

const AGENTCHAT_URL = process.env.AGENTCHAT_URL || 'wss://agentchat-server.fly.dev';
const PORT = process.env.PORT || 3000;
const IDENTITY_FILE = '.dashboard-identity.json';

// ============ Identity Management ============
function loadOrCreateIdentity() {
  if (existsSync(IDENTITY_FILE)) {
    const data = JSON.parse(readFileSync(IDENTITY_FILE, 'utf-8'));
    return {
      publicKey: decodeBase64(data.publicKey),
      secretKey: decodeBase64(data.privateKey),
      nick: data.nick
    };
  }

  const keypair = nacl.sign.keyPair();
  const fingerprint = encodeBase64(keypair.publicKey).slice(0, 8);
  const nick = `dashboard-${fingerprint.slice(0, 4).toLowerCase()}`;

  writeFileSync(IDENTITY_FILE, JSON.stringify({
    publicKey: encodeBase64(keypair.publicKey),
    privateKey: encodeBase64(keypair.secretKey),
    nick
  }, null, 2));

  console.log(`Created new identity: ${nick}`);
  return { ...keypair, nick };
}

// ============ State Store ============
const state = {
  agents: new Map(),
  channels: new Map(),
  leaderboard: [],
  proposals: new Map(),
  skills: [],
  connected: false,
  dashboardAgent: null
};

// Circular buffer for messages (in-memory, capped at 200 per channel)
class CircularBuffer {
  constructor(size) {
    this.size = size;
    this.buffer = [];
  }
  push(item) {
    this.buffer.push(item);
    if (this.buffer.length > this.size) this.buffer.shift();
  }
  toArray() { return [...this.buffer]; }
}

// ============ AgentChat Connection ============
let agentChatWs = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30000;

function connectToAgentChat(identity) {
  console.log(`Connecting to AgentChat at ${AGENTCHAT_URL}...`);

  agentChatWs = new WebSocket(AGENTCHAT_URL);

  agentChatWs.on('open', () => {
    console.log('Connected to AgentChat');
    state.connected = true;
    state.dashboardAgent = { id: null, nick: identity.nick };
    reconnectDelay = 1000;

    // Register with server
    send({ type: 'register', nick: identity.nick, publicKey: encodeBase64(identity.publicKey) });

    // Discover channels
    send({ type: 'channels' });

    // Join #general
    setTimeout(() => send({ type: 'join', channel: '#general' }), 500);

    // Request leaderboard
    setTimeout(() => send({ type: 'leaderboard' }), 1000);

    broadcastToDashboards({ type: 'connected', data: { dashboardAgent: state.dashboardAgent } });
  });

  agentChatWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleAgentChatMessage(msg);
    } catch (e) {
      console.error('Failed to parse AgentChat message:', e);
    }
  });

  agentChatWs.on('close', () => {
    console.log('Disconnected from AgentChat');
    state.connected = false;
    broadcastToDashboards({ type: 'disconnected' });
    scheduleReconnect(identity);
  });

  agentChatWs.on('error', (err) => {
    console.error('AgentChat error:', err.message);
  });
}

function send(msg) {
  if (agentChatWs?.readyState === WebSocket.OPEN) {
    agentChatWs.send(JSON.stringify(msg));
  }
}

function scheduleReconnect(identity) {
  console.log(`Reconnecting in ${reconnectDelay/1000}s...`);
  setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    connectToAgentChat(identity);
  }, reconnectDelay);
}

function handleAgentChatMessage(msg) {
  switch (msg.type) {
    case 'registered':
      state.dashboardAgent.id = msg.agentId;
      console.log(`Registered as ${msg.agentId}`);
      break;

    case 'message':
      handleIncomingMessage(msg);
      break;

    case 'channels':
      msg.channels?.forEach(ch => {
        if (!state.channels.has(ch.name)) {
          state.channels.set(ch.name, {
            name: ch.name,
            members: new Set(ch.members || []),
            messages: new CircularBuffer(200)
          });
        }
      });
      broadcastToDashboards({ type: 'channel_update', data: getChannelsSnapshot() });
      break;

    case 'presence':
    case 'agentJoin':
      const agent = {
        id: msg.agentId || msg.from,
        nick: msg.nick || msg.agentId,
        channels: new Set([msg.channel].filter(Boolean)),
        lastSeen: Date.now(),
        online: true
      };
      state.agents.set(agent.id, agent);
      if (msg.channel && state.channels.has(msg.channel)) {
        state.channels.get(msg.channel).members.add(agent.id);
      }
      broadcastToDashboards({ type: 'agent_update', data: { ...agent, channels: [...agent.channels], event: 'joined' } });
      break;

    case 'agentLeave':
      const leaving = state.agents.get(msg.agentId);
      if (leaving) {
        leaving.online = false;
        leaving.lastSeen = Date.now();
        if (msg.channel && state.channels.has(msg.channel)) {
          state.channels.get(msg.channel).members.delete(msg.agentId);
        }
        broadcastToDashboards({ type: 'agent_update', data: { ...leaving, channels: [...leaving.channels], event: 'left' } });
      }
      break;

    case 'leaderboard':
      state.leaderboard = msg.data || [];
      broadcastToDashboards({ type: 'leaderboard_update', data: state.leaderboard });
      break;

    case 'proposal':
      const proposal = {
        id: msg.proposalId,
        from: msg.from,
        to: msg.to,
        task: msg.task,
        amount: msg.amount,
        currency: msg.currency,
        status: msg.status || 'pending',
        eloStake: msg.eloStake,
        createdAt: msg.createdAt || Date.now(),
        updatedAt: Date.now()
      };
      state.proposals.set(proposal.id, proposal);
      broadcastToDashboards({ type: 'proposal_update', data: proposal });
      break;

    case 'skills':
      state.skills = msg.data || [];
      broadcastToDashboards({ type: 'skills_update', data: state.skills });
      break;
  }
}

function handleIncomingMessage(msg) {
  const channel = msg.to || msg.channel;
  if (!channel) return;

  if (!state.channels.has(channel)) {
    state.channels.set(channel, {
      name: channel,
      members: new Set(),
      messages: new CircularBuffer(200)
    });
  }

  const message = {
    id: msg.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    from: msg.from,
    fromNick: msg.nick || msg.from,
    to: channel,
    content: msg.content || msg.message,
    ts: msg.ts || Date.now(),
    isProposal: msg.isProposal || false
  };

  state.channels.get(channel).messages.push(message);
  broadcastToDashboards({ type: 'message', data: message });
}

// ============ Dashboard Bridge ============
const dashboardClients = new Set();

function broadcastToDashboards(msg) {
  const data = JSON.stringify(msg);
  dashboardClients.forEach(client => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  });
}

function getStateSnapshot() {
  return {
    agents: [...state.agents.values()].map(a => ({ ...a, channels: [...a.channels] })),
    channels: [...state.channels.values()].map(c => ({
      name: c.name,
      members: [...c.members],
      messageCount: c.messages.toArray().length
    })),
    messages: Object.fromEntries(
      [...state.channels.entries()].map(([name, ch]) => [name, ch.messages.toArray()])
    ),
    leaderboard: state.leaderboard,
    proposals: [...state.proposals.values()],
    skills: state.skills,
    dashboardAgent: state.dashboardAgent
  };
}

function getChannelsSnapshot() {
  return [...state.channels.values()].map(c => ({
    name: c.name,
    members: [...c.members],
    messageCount: c.messages.toArray().length
  }));
}

function handleDashboardMessage(client, msg) {
  switch (msg.type) {
    case 'send_message':
      if (client.mode === 'lurk') {
        client.ws.send(JSON.stringify({ type: 'error', data: { code: 'LURK_MODE', message: 'Cannot send in lurk mode' } }));
        return;
      }
      send({ type: 'send', to: msg.data.to, content: msg.data.content });
      client.ws.send(JSON.stringify({ type: 'message_sent', data: { success: true } }));
      break;

    case 'set_mode':
      client.mode = msg.data.mode;
      client.ws.send(JSON.stringify({ type: 'mode_changed', data: { mode: client.mode } }));
      break;

    case 'subscribe':
      client.subscriptions = new Set(msg.data.channels);
      break;

    case 'join_channel':
      if (client.mode === 'lurk') {
        client.ws.send(JSON.stringify({ type: 'error', data: { code: 'LURK_MODE', message: 'Cannot join in lurk mode' } }));
        return;
      }
      send({ type: 'join', channel: msg.data.channel });
      break;

    case 'refresh_leaderboard':
      send({ type: 'leaderboard' });
      break;

    case 'search_skills':
      send({ type: 'searchSkills', ...msg.data });
      break;

    case 'accept_proposal':
      if (client.mode === 'lurk') {
        client.ws.send(JSON.stringify({ type: 'error', data: { code: 'LURK_MODE', message: 'Cannot accept in lurk mode' } }));
        return;
      }
      send({ type: 'accept', proposalId: msg.data.proposalId });
      client.ws.send(JSON.stringify({ type: 'proposal_accepted', data: { success: true, proposalId: msg.data.proposalId } }));
      break;
  }
}

// ============ HTTP & WebSocket Servers ============
const app = express();
const server = createServer(app);

// Health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    connected: state.connected,
    uptime: process.uptime(),
    agents: state.agents.size,
    channels: state.channels.size
  });
});

// Static files (for built React app)
app.use(express.static('public'));

// Dashboard WebSocket
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  if (dashboardClients.size >= 100) {
    ws.send(JSON.stringify({ type: 'error', data: { code: 'SERVER_FULL', message: 'Too many clients' } }));
    ws.close();
    return;
  }

  const client = {
    ws,
    id: `client-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    mode: 'lurk',
    subscriptions: new Set(),
    lastPing: Date.now()
  };
  dashboardClients.add(client);
  console.log(`Dashboard client connected: ${client.id}`);

  // Send initial state
  ws.send(JSON.stringify({ type: 'state_sync', data: getStateSnapshot() }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'pong') {
        client.lastPing = Date.now();
      } else {
        handleDashboardMessage(client, msg);
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', data: { code: 'INVALID_MESSAGE', message: 'Malformed message' } }));
    }
  });

  ws.on('close', () => {
    dashboardClients.delete(client);
    console.log(`Dashboard client disconnected: ${client.id}`);
  });
});

// Heartbeat
setInterval(() => {
  const now = Date.now();
  dashboardClients.forEach(client => {
    if (now - client.lastPing > 40000) {
      client.ws.terminate();
      dashboardClients.delete(client);
    } else if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({ type: 'ping' }));
    }
  });
}, 30000);

// ============ Startup ============
const identity = loadOrCreateIdentity();
connectToAgentChat(identity);

server.listen(PORT, () => {
  console.log(`Dashboard server running at http://localhost:${PORT}`);
  console.log(`WebSocket bridge at ws://localhost:${PORT}/ws`);
  console.log(`Health check at http://localhost:${PORT}/api/health`);
});
