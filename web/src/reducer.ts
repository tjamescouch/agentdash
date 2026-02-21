import type { DashboardState, DashboardAction, Message, Toast } from './types';

// ============ Persistence ============

export const savedMode = typeof window !== 'undefined' ? localStorage.getItem('dashboardMode') || 'lurk' : 'lurk';
export const savedNick = typeof window !== 'undefined' ? localStorage.getItem('dashboardNick') : null;

export const loadPersistedMessages = (): Record<string, Message[]> => {
  try {
    const saved = localStorage.getItem('dashboardMessages');
    return saved ? JSON.parse(saved) : {};
  } catch { return {}; }
};

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
export const persistMessages = (messages: Record<string, Message[]>) => {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      const trimmed: Record<string, Message[]> = {};
      for (const [ch, msgs] of Object.entries(messages)) {
        trimmed[ch] = msgs.slice(-100);
      }
      localStorage.setItem('dashboardMessages', JSON.stringify(trimmed));
    } catch (e) { console.warn('Failed to persist messages:', e); }
  }, 1000);
};

export const getSavedChannels = (): string[] => {
  try {
    const saved = localStorage.getItem('dashboardChannels');
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
};

export const addSavedChannel = (channel: string) => {
  try {
    const channels = getSavedChannels();
    if (!channels.includes(channel)) {
      channels.push(channel);
      localStorage.setItem('dashboardChannels', JSON.stringify(channels));
    }
  } catch (e) { console.warn('Failed to persist channel:', e); }
};

export const removeSavedChannel = (channel: string) => {
  try {
    const channels = getSavedChannels().filter(c => c !== channel);
    localStorage.setItem('dashboardChannels', JSON.stringify(channels));
  } catch (e) { console.warn('Failed to remove channel:', e); }
};

// ============ Initial State ============

export const initialState: DashboardState = {
  connected: false,
  connectionStatus: 'connecting',
  connectionError: null,
  mode: savedMode,
  agents: {},
  channels: {},
  messages: loadPersistedMessages(),
  leaderboard: [],
  skills: [],
  proposals: {},
  disputes: {},
  selectedChannel: '#general',
  selectedAgent: null,
  rightPanel: 'proposals',
  dashboardAgent: null,
  unreadCounts: {},
  activityCounts: {},
  typingAgents: {},
  transfers: {},
  sendModal: null,
  saveModal: null,
  logs: [],
  logsOpen: false,
  spend: { totalCalls: 0, totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, byAgent: {}, byModel: {} },
  spendOpen: false,
  pulseOpen: false,
  killSwitchOpen: false,
  agentControlOpen: false,
  lockdown: false,
  hideOfflineAgents: true,
  toasts: []
};

// ============ Reducer ============

export function reducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case 'STATE_SYNC': {
      const serverMsgs = action.data.messages || {};
      const mergedMessages: Record<string, Message[]> = { ...state.messages };

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
        connectionStatus: 'ready',
        connectionError: null,
        agents: Object.fromEntries(action.data.agents.map(a => [a.id, a])),
        channels: Object.fromEntries(action.data.channels.map(c => [c.name, c])),
        messages: mergedMessages,
        leaderboard: action.data.leaderboard || [],
        skills: action.data.skills || [],
        proposals: Object.fromEntries((action.data.proposals || []).map(p => [p.id, p])),
        disputes: Object.fromEntries((action.data.disputes || []).map(d => [d.id, d])),
        dashboardAgent: action.data.dashboardAgent
      };
    }
    case 'CONNECTED':
      return { ...state, connected: true, connectionStatus: 'syncing', connectionError: null, dashboardAgent: action.data?.dashboardAgent ?? state.dashboardAgent };
    case 'DISCONNECTED':
      return { ...state, connected: false, connectionStatus: state.connectionStatus === 'ready' ? 'disconnected' : state.connectionStatus };
    case 'MESSAGE': {
      const channel = action.data.to;
      const existingMsgs = state.messages[channel] || [];
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
      const newUnread = channel !== state.selectedChannel && action.data.from !== '@server'
        ? { ...state.unreadCounts, [channel]: (state.unreadCounts[channel] || 0) + 1 }
        : state.unreadCounts;
      return { ...state, messages: newMessages, unreadCounts: newUnread };
    }
    case 'AGENT_UPDATE': {
      const prev = state.agents[action.data.id];
      const prevChannels = new Set(prev?.channels || []);
      const newChannels = new Set(action.data.channels || []);
      const newActivity = { ...state.activityCounts };
      if (action.data.event === 'joined') {
        for (const ch of newChannels) {
          if (!prevChannels.has(ch) && ch !== state.selectedChannel) {
            newActivity[ch] = (newActivity[ch] || 0) + 1;
          }
        }
      } else if (action.data.event === 'left') {
        for (const ch of prevChannels) {
          if (!newChannels.has(ch) && ch !== state.selectedChannel) {
            newActivity[ch] = (newActivity[ch] || 0) + 1;
          }
        }
      }
      return {
        ...state,
        agents: { ...state.agents, [action.data.id]: action.data },
        activityCounts: newActivity
      };
    }
    case 'PROPOSAL_UPDATE':
      return {
        ...state,
        proposals: { ...state.proposals, [action.data.id]: action.data }
      };
    case 'DISPUTE_UPDATE':
      return {
        ...state,
        disputes: { ...state.disputes, [action.data.id]: action.data }
      };
    case 'LEADERBOARD_UPDATE':
      return { ...state, leaderboard: action.data };
    case 'SKILLS_UPDATE':
      return { ...state, skills: action.data };
    case 'SET_MODE':
      if (typeof window !== 'undefined') {
        localStorage.setItem('dashboardMode', action.mode);
      }
      return { ...state, mode: action.mode };
    case 'SELECT_CHANNEL': {
      const clearedUnread = { ...state.unreadCounts };
      delete clearedUnread[action.channel];
      const clearedActivity = { ...state.activityCounts };
      delete clearedActivity[action.channel];
      return { ...state, selectedChannel: action.channel, unreadCounts: clearedUnread, activityCounts: clearedActivity };
    }
    case 'SELECT_AGENT':
      return { ...state, selectedAgent: action.agent, rightPanel: 'detail' };
    case 'SET_RIGHT_PANEL':
      return { ...state, rightPanel: action.panel };
    case 'TYPING': {
      const key = `${action.data.from}:${action.data.channel}`;
      return { ...state, typingAgents: { ...state.typingAgents, [key]: Date.now() } };
    }
    case 'CLEAR_TYPING': {
      const cleared = { ...state.typingAgents };
      delete cleared[action.agentId];
      return { ...state, typingAgents: cleared };
    }
    case 'TRANSFER_UPDATE':
      return {
        ...state,
        transfers: { ...state.transfers, [action.data.id]: action.data }
      };
    case 'SHOW_SEND_MODAL':
      return { ...state, sendModal: action.data };
    case 'HIDE_SEND_MODAL':
      return { ...state, sendModal: null };
    case 'SHOW_SAVE_MODAL':
      return { ...state, saveModal: action.data };
    case 'HIDE_SAVE_MODAL':
      return { ...state, saveModal: null };
    case 'LOG': {
      const logs = [...state.logs, action.data];
      return { ...state, logs: logs.length > 500 ? logs.slice(-500) : logs };
    }
    case 'LOG_HISTORY':
      return { ...state, logs: action.data.slice(-500) };
    case 'TOGGLE_LOGS':
      return { ...state, logsOpen: !state.logsOpen };
    case 'CLEAR_LOGS':
      return { ...state, logs: [] };
    case 'TOGGLE_PULSE':
      return { ...state, pulseOpen: !state.pulseOpen };
    case 'CONNECTION_ERROR':
      return { ...state, connectionStatus: 'error', connectionError: action.error };
    case 'CONNECTING':
      return { ...state, connectionStatus: 'connecting', connectionError: null };
    case 'SPEND':
      return { ...state, spend: action.data };
    case 'TOGGLE_SPEND':
      return { ...state, spendOpen: !state.spendOpen };
    case 'TOGGLE_KILLSWITCH':
      return { ...state, killSwitchOpen: !state.killSwitchOpen };
    case 'TOGGLE_AGENT_CONTROL':
      return { ...state, agentControlOpen: !state.agentControlOpen };
    case 'LOCKDOWN':
      return { ...state, lockdown: true, killSwitchOpen: false };
    case 'SET_HIDE_OFFLINE_AGENTS':
      return { ...state, hideOfflineAgents: action.value };
    case 'ADD_TOAST': {
      const toast: Toast = {
        ...action.toast,
        id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ts: Date.now()
      };
      // Keep max 5 toasts visible
      const toasts = [...state.toasts, toast].slice(-5);
      return { ...state, toasts };
    }
    case 'DISMISS_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.id) };

    case 'AGENTS_BULK_UPDATE':
      return { ...state, agents: Object.fromEntries(action.data.map(a => [a.id, a])) };
    case 'CHANNELS_BULK_UPDATE':
      return { ...state, channels: Object.fromEntries(action.data.map(c => [c.name, c])) };
    case 'SET_DASHBOARD_AGENT': {
      const agent = { id: action.data.agentId, nick: action.data.nick };
      if (typeof window !== 'undefined') {
        localStorage.setItem('dashboardNick', agent.nick);
        if (action.data.publicKey && action.data.secretKey) {
          localStorage.setItem('dashboardIdentity', JSON.stringify({
            publicKey: action.data.publicKey,
            secretKey: action.data.secretKey
          }));
        }
      }
      return { ...state, dashboardAgent: agent };
    }
    case 'NICK_CHANGED': {
      if (typeof window !== 'undefined') localStorage.setItem('dashboardNick', action.nick);
      return {
        ...state,
        dashboardAgent: state.dashboardAgent
          ? { ...state.dashboardAgent, nick: action.nick }
          : { id: null, nick: action.nick }
      };
    }
    default:
      return state;
  }
}
