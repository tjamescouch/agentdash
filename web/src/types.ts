export interface Agent {
  id: string;
  nick: string;
  channels: string[];
  lastSeen: number;
  online: boolean;
  presence?: string;
  event?: string;
  verified?: boolean;
  isDashboard?: boolean;
}

export interface Channel {
  name: string;
  members: string[];
  messageCount: number;
  agentCount?: number;
}

export interface Message {
  id: string;
  from: string;
  fromNick: string;
  to: string;
  content: string;
  ts: number;
  isProposal: boolean;
}

export interface Proposal {
  id: string;
  from: string;
  to: string;
  task: string;
  amount?: number;
  currency?: string;
  status: string;
  eloStake?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Skill {
  capability: string;
  rate?: number;
  currency?: string;
  agentId: string;
  description?: string;
}

export interface DisputeEvidenceItem {
  kind: string;
  label: string;
  value: string;
  url?: string;
}

export interface DisputeEvidence {
  items: DisputeEvidenceItem[];
  statement: string;
  submitted_at: number;
}

export interface ArbiterSlot {
  agent_id: string;
  status: string;
  accepted_at?: number;
  vote?: {
    verdict: string;
    reasoning: string;
    voted_at: number;
  };
}

export interface Dispute {
  id: string;
  proposal_id: string;
  disputant: string;
  respondent: string;
  reason: string;
  phase: string;
  arbiters: ArbiterSlot[];
  disputant_evidence?: DisputeEvidence;
  respondent_evidence?: DisputeEvidence;
  verdict?: string;
  rating_changes?: Record<string, { old: number; new: number; delta: number }>;
  created_at: number;
  evidence_deadline?: number;
  vote_deadline?: number;
  resolved_at?: number;
  updated_at: number;
}

export interface LeaderboardEntry {
  id: string;
  nick?: string;
  elo: number;
}

export interface DashboardAgent {
  id: string | null;
  nick: string;
}

export interface FileTransferUI {
  id: string;
  direction: 'out' | 'in';
  files: { name: string; size: number }[];
  totalSize: number;
  status: 'uploading' | 'selecting' | 'offered' | 'accepted' | 'transferring' | 'complete' | 'rejected' | 'saving' | 'saved' | 'error';
  progress: number;
  peer: string;
  peerNick: string;
  error?: string;
}

export interface LogEntry {
  level: string;
  ts: number;
  msg: string;
}


export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  ts: number;
  duration: number; // ms, 0 = sticky
}

export interface SpendStats {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  byAgent: Record<string, { calls: number; inputTokens: number; outputTokens: number; totalTokens: number }>;
  byModel: Record<string, { calls: number; inputTokens: number; outputTokens: number; totalTokens: number }>;
  buckets1m?: Array<{ t: number; inputTokens: number; outputTokens: number; totalTokens: number; calls: number }>;
}

export interface DashboardState {
  connected: boolean;
  connectionStatus: 'connecting' | 'syncing' | 'ready' | 'error' | 'disconnected';
  connectionError: string | null;
  mode: string;
  agents: Record<string, Agent>;
  channels: Record<string, Channel>;
  messages: Record<string, Message[]>;
  leaderboard: LeaderboardEntry[];
  skills: Skill[];
  proposals: Record<string, Proposal>;
  disputes: Record<string, Dispute>;
  selectedChannel: string;
  selectedAgent: Agent | null;
  rightPanel: string;
  dashboardAgent: DashboardAgent | null;
  unreadCounts: Record<string, number>;
  activityCounts: Record<string, number>;
  typingAgents: Record<string, number>;
  transfers: Record<string, FileTransferUI>;
  sendModal: { transferId: string; files: { name: string; size: number }[] } | null;
  saveModal: { transferId: string; files: { name: string; size: number }[] } | null;
  logs: LogEntry[];
  logsOpen: boolean;
  spend: SpendStats;
  spendOpen: boolean;
  pulseOpen: boolean;
  killSwitchOpen: boolean;
  agentControlOpen: boolean;
  lockdown: boolean;
  toasts: Toast[];
}

export type DashboardAction =
  | { type: 'STATE_SYNC'; data: StateSyncPayload }
  | { type: 'CONNECTED'; data?: { dashboardAgent?: DashboardAgent } }
  | { type: 'DISCONNECTED' }
  | { type: 'MESSAGE'; data: Message }
  | { type: 'AGENT_UPDATE'; data: Agent }
  | { type: 'PROPOSAL_UPDATE'; data: Proposal }
  | { type: 'DISPUTE_UPDATE'; data: Dispute }
  | { type: 'LEADERBOARD_UPDATE'; data: LeaderboardEntry[] }
  | { type: 'SKILLS_UPDATE'; data: Skill[] }
  | { type: 'SET_MODE'; mode: string }
  | { type: 'SELECT_CHANNEL'; channel: string }
  | { type: 'SELECT_AGENT'; agent: Agent }
  | { type: 'SET_RIGHT_PANEL'; panel: string }
  | { type: 'TYPING'; data: { from: string; from_name?: string; channel: string } }
  | { type: 'CLEAR_TYPING'; agentId: string }
  | { type: 'TRANSFER_UPDATE'; data: FileTransferUI }
  | { type: 'SHOW_SEND_MODAL'; data: { transferId: string; files: { name: string; size: number }[] } }
  | { type: 'HIDE_SEND_MODAL' }
  | { type: 'SHOW_SAVE_MODAL'; data: { transferId: string; files: { name: string; size: number }[] } }
  | { type: 'HIDE_SAVE_MODAL' }
  | { type: 'LOG'; data: LogEntry }
  | { type: 'LOG_HISTORY'; data: LogEntry[] }
  | { type: 'TOGGLE_LOGS' }
  | { type: 'CLEAR_LOGS' }
  | { type: 'SPEND'; data: SpendStats }
  | { type: 'TOGGLE_SPEND' }
  | { type: 'TOGGLE_PULSE' }
  | { type: 'CONNECTION_ERROR'; error: string }
  | { type: 'CONNECTING' }
  | { type: 'TOGGLE_KILLSWITCH' }
  | { type: 'TOGGLE_AGENT_CONTROL' }
  | { type: 'LOCKDOWN' }
  | { type: 'ADD_TOAST'; toast: Omit<Toast, 'id' | 'ts'> }
  | { type: 'DISMISS_TOAST'; id: string }
  | { type: 'AGENTS_BULK_UPDATE'; data: Agent[] }
  | { type: 'CHANNELS_BULK_UPDATE'; data: Channel[] }
  | { type: 'SET_DASHBOARD_AGENT'; data: { agentId: string; nick: string; publicKey?: string; secretKey?: string } }
  | { type: 'NICK_CHANGED'; nick: string };

export interface StateSyncPayload {
  agents: Agent[];
  channels: Channel[];
  messages: Record<string, Message[]>;
  leaderboard: LeaderboardEntry[];
  skills: Skill[];
  proposals: Proposal[];
  disputes: Dispute[];
  dashboardAgent: DashboardAgent;
}

export type WsSendFn = (msg: Record<string, unknown>) => void;
