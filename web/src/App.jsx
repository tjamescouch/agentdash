import { useState, useEffect, useRef, useReducer, createContext, useContext } from 'react';

// Context
const DashboardContext = createContext();

// Load persisted mode from localStorage
const savedMode = typeof window !== 'undefined' ? localStorage.getItem('dashboardMode') || 'lurk' : 'lurk';

// Load persisted messages from localStorage
const loadPersistedMessages = () => {
  try {
    const saved = localStorage.getItem('dashboardMessages');
    return saved ? JSON.parse(saved) : {};
  } catch { return {}; }
};

// Save messages to localStorage (debounced)
let saveTimeout = null;
const persistMessages = (messages) => {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      // Only keep last 100 messages per channel to avoid storage limits
      const trimmed = {};
      for (const [ch, msgs] of Object.entries(messages)) {
        trimmed[ch] = msgs.slice(-100);
      }
      localStorage.setItem('dashboardMessages', JSON.stringify(trimmed));
    } catch (e) { console.warn('Failed to persist messages:', e); }
  }, 1000);
};

const initialState = {
  connected: false,
  mode: savedMode,
  agents: {},
  channels: {},
  messages: loadPersistedMessages(),
  leaderboard: [],
  skills: [],
  proposals: {},
  selectedChannel: '#general',
  selectedAgent: null,
  rightPanel: 'proposals',
  dashboardAgent: null
};

function reducer(state, action) {
  switch (action.type) {
    case 'STATE_SYNC': {
      // Merge server messages with locally persisted messages
      const serverMsgs = action.data.messages || {};
      const mergedMessages = { ...state.messages };

      for (const [channel, msgs] of Object.entries(serverMsgs)) {
        const existing = mergedMessages[channel] || [];
        const existingIds = new Set(existing.map(m => m.id || `${m.ts}-${m.from}`));
        const newMsgs = msgs.filter(m => !existingIds.has(m.id || `${m.ts}-${m.from}`));
        mergedMessages[channel] = [...existing, ...newMsgs].sort((a, b) => a.ts - b.ts).slice(-200);
      }

      persistMessages(mergedMessages);

      return {
        ...state,
        connected: true,
        // Keep the persisted mode instead of resetting to lurk
        agents: Object.fromEntries(action.data.agents.map(a => [a.id, a])),
        channels: Object.fromEntries(action.data.channels.map(c => [c.name, c])),
        messages: mergedMessages,
        leaderboard: action.data.leaderboard || [],
        skills: action.data.skills || [],
        proposals: Object.fromEntries((action.data.proposals || []).map(p => [p.id, p])),
        dashboardAgent: action.data.dashboardAgent
      };
    }
    case 'CONNECTED':
      return { ...state, connected: true, dashboardAgent: action.data?.dashboardAgent };
    case 'DISCONNECTED':
      return { ...state, connected: false };
    case 'MESSAGE': {
      const channel = action.data.to;
      const existingMsgs = state.messages[channel] || [];
      // Deduplicate by id or by ts+from+content
      const msgKey = action.data.id || `${action.data.ts}-${action.data.from}`;
      const isDuplicate = existingMsgs.some(m =>
        (m.id && m.id === action.data.id) ||
        (m.ts === action.data.ts && m.from === action.data.from && m.content === action.data.content)
      );
      if (isDuplicate) return state;

      const newMessages = {
        ...state.messages,
        [channel]: [...existingMsgs, action.data]
      };
      persistMessages(newMessages);

      return { ...state, messages: newMessages };
    }
    case 'AGENT_UPDATE':
      return {
        ...state,
        agents: { ...state.agents, [action.data.id]: action.data }
      };
    case 'PROPOSAL_UPDATE':
      return {
        ...state,
        proposals: { ...state.proposals, [action.data.id]: action.data }
      };
    case 'LEADERBOARD_UPDATE':
      return { ...state, leaderboard: action.data };
    case 'SKILLS_UPDATE':
      return { ...state, skills: action.data };
    case 'SET_MODE':
      // Persist mode to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('dashboardMode', action.mode);
      }
      return { ...state, mode: action.mode };
    case 'SELECT_CHANNEL':
      return { ...state, selectedChannel: action.channel };
    case 'SELECT_AGENT':
      return { ...state, selectedAgent: action.agent, rightPanel: 'detail' };
    case 'SET_RIGHT_PANEL':
      return { ...state, rightPanel: action.panel };
    default:
      return state;
  }
}

// Agent color from nick
function agentColor(nick) {
  const hash = (nick || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 60%)`;
}

// Format timestamp
function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false });
}

// WebSocket hook
function useWebSocket(dispatch) {
  const ws = useRef(null);
  const [send, setSend] = useState(() => () => {});

  useEffect(() => {
    // In development, connect directly to backend
    const wsUrl = import.meta.env.DEV
      ? 'ws://localhost:3000/ws'
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

    function connect() {
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log('WebSocket connected');
        // Sync saved mode to server on connect/reconnect
        const savedMode = localStorage.getItem('dashboardMode');
        if (savedMode && savedMode !== 'lurk') {
          ws.current.send(JSON.stringify({ type: 'set_mode', data: { mode: savedMode } }));
        }
      };

      ws.current.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'ping') {
          ws.current.send(JSON.stringify({ type: 'pong' }));
          return;
        }
        switch (msg.type) {
          case 'state_sync':
            dispatch({ type: 'STATE_SYNC', data: msg.data });
            break;
          case 'connected':
            dispatch({ type: 'CONNECTED', data: msg.data });
            break;
          case 'disconnected':
            dispatch({ type: 'DISCONNECTED' });
            break;
          case 'message':
            dispatch({ type: 'MESSAGE', data: msg.data });
            break;
          case 'agent_update':
            dispatch({ type: 'AGENT_UPDATE', data: msg.data });
            break;
          case 'proposal_update':
            dispatch({ type: 'PROPOSAL_UPDATE', data: msg.data });
            break;
          case 'leaderboard_update':
            dispatch({ type: 'LEADERBOARD_UPDATE', data: msg.data });
            break;
          case 'skills_update':
            dispatch({ type: 'SKILLS_UPDATE', data: msg.data });
            break;
          case 'mode_changed':
            dispatch({ type: 'SET_MODE', mode: msg.data.mode });
            break;
          case 'error':
            console.error('Server error:', msg.data?.code, msg.data?.message);
            // If server says we're in lurk mode, sync the frontend state
            if (msg.data?.code === 'LURK_MODE') {
              dispatch({ type: 'SET_MODE', mode: 'lurk' });
            }
            break;
        }
      };

      ws.current.onclose = () => {
        dispatch({ type: 'DISCONNECTED' });
        setTimeout(connect, 2000);
      };

      setSend(() => (msg) => {
        if (ws.current?.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify(msg));
        }
      });
    }

    connect();
    return () => ws.current?.close();
  }, [dispatch]);

  return send;
}

// Components
function TopBar({ state, send }) {
  return (
    <div className="topbar">
      <div className="topbar-left">
        <span className="logo">AgentChat Dashboard</span>
        <span className={`status ${state.connected ? 'online' : 'offline'}`}>
          {state.connected ? 'CONNECTED' : 'DISCONNECTED'}
        </span>
      </div>
      <div className="topbar-right">
        {state.dashboardAgent && (
          <span className="dashboard-nick">as {state.dashboardAgent.nick}</span>
        )}
        <button
          className={`mode-btn ${state.mode}`}
          onClick={() => send({ type: 'set_mode', data: { mode: state.mode === 'lurk' ? 'participate' : 'lurk' } })}
        >
          {state.mode === 'lurk' ? 'LURK' : 'PARTICIPATE'}
        </button>
      </div>
    </div>
  );
}

function Sidebar({ state, dispatch }) {
  const agents = Object.values(state.agents).sort((a, b) => {
    if (a.online !== b.online) return b.online ? 1 : -1;
    return (a.nick || a.id).localeCompare(b.nick || b.id);
  });

  // Find duplicate nicks to show disambiguator
  const nickCounts = {};
  agents.forEach(a => {
    const nick = a.nick || a.id;
    nickCounts[nick] = (nickCounts[nick] || 0) + 1;
  });

  // Helper to get display name with disambiguator if needed
  const getDisplayName = (agent) => {
    const nick = agent.nick || agent.id;
    if (nickCounts[nick] > 1) {
      // Show shortened ID to distinguish duplicates
      const shortId = agent.id.replace('@', '').slice(0, 6);
      return `${nick} (${shortId})`;
    }
    return nick;
  };

  const channels = Object.values(state.channels);

  return (
    <div className="sidebar">
      <div className="section">
        <h3>AGENTS ({agents.length})</h3>
        <div className="list">
          {agents.map(agent => (
            <div
              key={agent.id}
              className={`list-item ${state.selectedAgent?.id === agent.id ? 'selected' : ''}`}
              onClick={() => dispatch({ type: 'SELECT_AGENT', agent })}
            >
              <span className={`dot ${agent.online ? 'online' : 'offline'}`} />
              <span className="nick" style={{ color: agentColor(agent.nick || agent.id) }}>
                {getDisplayName(agent)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <h3>CHANNELS ({channels.length})</h3>
        <div className="list">
          {channels.map(channel => (
            <div
              key={channel.name}
              className={`list-item ${state.selectedChannel === channel.name ? 'selected' : ''}`}
              onClick={() => dispatch({ type: 'SELECT_CHANNEL', channel: channel.name })}
            >
              <span className="channel-name">{channel.name}</span>
              <span className="member-count">{channel.members?.length || 0}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="quick-actions">
        <button onClick={() => dispatch({ type: 'SET_RIGHT_PANEL', panel: 'leaderboard' })}>Leaderboard</button>
        <button onClick={() => dispatch({ type: 'SET_RIGHT_PANEL', panel: 'skills' })}>Skills</button>
        <button onClick={() => dispatch({ type: 'SET_RIGHT_PANEL', panel: 'proposals' })}>Proposals</button>
      </div>
    </div>
  );
}

function MessageFeed({ state, send }) {
  const [input, setInput] = useState('');
  const [hideServer, setHideServer] = useState(true);
  const messagesEndRef = useRef(null);
  const allMessages = state.messages[state.selectedChannel] || [];
  // Filter out @server messages if hideServer is true
  const messages = hideServer
    ? allMessages.filter(m => m.from !== '@server')
    : allMessages;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim() || state.mode === 'lurk') return;
    send({ type: 'send_message', data: { to: state.selectedChannel, content: input } });
    setInput('');
  };

  return (
    <div className="message-feed">
      <div className="feed-header">
        <span className="channel-title">{state.selectedChannel || 'Select a channel'}</span>
        <label className="server-toggle">
          <input
            type="checkbox"
            checked={hideServer}
            onChange={(e) => setHideServer(e.target.checked)}
          />
          Hide @server
        </label>
      </div>
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={msg.id || i} className="message">
            <span className="time">[{formatTime(msg.ts)}]</span>
            <span className="from" style={{ color: agentColor(state.agents[msg.from]?.nick || msg.fromNick || msg.from) }}>
              &lt;{state.agents[msg.from]?.nick || msg.fromNick || msg.from}&gt;
            </span>
            <span className="content">{msg.content}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form className="input-bar" onSubmit={handleSend}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={state.mode === 'lurk' ? 'Lurk mode - read only' : 'Type a message...'}
          disabled={state.mode === 'lurk'}
        />
        <button type="submit" disabled={state.mode === 'lurk'}>Send</button>
      </form>
    </div>
  );
}

function RightPanel({ state, dispatch, send }) {
  if (state.rightPanel === 'leaderboard') {
    return (
      <div className="right-panel">
        <h3>LEADERBOARD</h3>
        <div className="leaderboard">
          {state.leaderboard.map((entry, i) => (
            <div key={entry.id} className="leaderboard-entry">
              <span className="rank">#{i + 1}</span>
              <span className="nick" style={{ color: agentColor(entry.nick || entry.id) }}>
                {entry.nick || entry.id}
              </span>
              <span className="elo">{entry.elo}</span>
            </div>
          ))}
          {state.leaderboard.length === 0 && <div className="empty">No data</div>}
        </div>
      </div>
    );
  }

  if (state.rightPanel === 'skills') {
    return (
      <div className="right-panel">
        <h3>SKILLS MARKETPLACE</h3>
        <div className="skills">
          {state.skills.map((skill, i) => (
            <div key={i} className="skill-entry">
              <div className="skill-header">
                <span className="capability">{skill.capability}</span>
                <span className="rate">{skill.rate} {skill.currency}</span>
              </div>
              <div className="skill-agent">{skill.agentId}</div>
              <div className="skill-desc">{skill.description}</div>
            </div>
          ))}
          {state.skills.length === 0 && <div className="empty">No skills registered</div>}
        </div>
      </div>
    );
  }

  if (state.rightPanel === 'proposals') {
    const proposals = Object.values(state.proposals);
    return (
      <div className="right-panel">
        <h3>PROPOSALS ({proposals.length})</h3>
        <div className="proposals">
          {proposals.map(p => (
            <div key={p.id} className={`proposal-entry status-${p.status}`}>
              <div className="proposal-header">
                <span className={`status-badge ${p.status}`}>{p.status}</span>
                {p.amount && <span className="amount">{p.amount} {p.currency}</span>}
              </div>
              <div className="proposal-task">{p.task}</div>
              <div className="proposal-parties">
                <span style={{ color: agentColor(p.from) }}>{p.from}</span>
                <span className="arrow"> → </span>
                <span style={{ color: agentColor(p.to) }}>{p.to}</span>
              </div>
              {p.status === 'pending' && state.mode === 'participate' && (
                <button
                  className="claim-btn"
                  onClick={() => send({ type: 'accept_proposal', data: { proposalId: p.id } })}
                >
                  Claim Task
                </button>
              )}
            </div>
          ))}
          {proposals.length === 0 && <div className="empty">No active proposals</div>}
        </div>
      </div>
    );
  }

  // Agent detail
  const agent = state.selectedAgent;
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  if (!agent) {
    return (
      <div className="right-panel">
        <div className="empty">Select an agent to view details</div>
      </div>
    );
  }

  const handleRename = (e) => {
    e.preventDefault();
    if (renameValue.trim()) {
      send({ type: 'set_agent_name', data: { agentId: agent.id, name: renameValue.trim() } });
      setIsRenaming(false);
      setRenameValue('');
    }
  };

  return (
    <div className="right-panel">
      <h3>AGENT DETAIL</h3>
      <div className="agent-detail">
        {isRenaming ? (
          <form onSubmit={handleRename} className="rename-form">
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Enter display name..."
              autoFocus
            />
            <button type="submit">Save</button>
            <button type="button" onClick={() => setIsRenaming(false)}>Cancel</button>
          </form>
        ) : (
          <div
            className="detail-nick clickable"
            style={{ color: agentColor(agent.nick || agent.id) }}
            onClick={() => { setIsRenaming(true); setRenameValue(agent.nick || ''); }}
            title="Click to rename"
          >
            {agent.nick || agent.id} ✏️
          </div>
        )}
        <div className="detail-id">{agent.id}</div>
        <div className={`detail-status ${agent.online ? 'online' : 'offline'}`}>
          {agent.online ? 'Online' : 'Offline'}
        </div>
        {agent.channels && agent.channels.length > 0 && (
          <div className="detail-channels">
            <span className="label">Channels:</span>
            {agent.channels.map(ch => (
              <span
                key={ch}
                className="channel-tag"
                onClick={() => dispatch({ type: 'SELECT_CHANNEL', channel: ch })}
              >
                {ch}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const send = useWebSocket(dispatch);

  return (
    <DashboardContext.Provider value={{ state, dispatch, send }}>
      <div className="dashboard">
        <TopBar state={state} send={send} />
        <div className="main">
          <Sidebar state={state} dispatch={dispatch} />
          <MessageFeed state={state} send={send} />
          <RightPanel state={state} dispatch={dispatch} send={send} />
        </div>
      </div>
    </DashboardContext.Provider>
  );
}
