import { useState } from 'react';
import type { Agent, DashboardState, DashboardAction, WsSendFn } from '../types';
import { agentColor } from '../utils';
import { addSavedChannel } from '../reducer';

export function Sidebar({ state, dispatch, sidebarWidth, send }: { state: DashboardState; dispatch: React.Dispatch<DashboardAction>; sidebarWidth: number; send: WsSendFn }) {
  const [joinInput, setJoinInput] = useState('');
  const agents = Object.values(state.agents)
    .filter(a => !state.hideOfflineAgents || a.online)
    .sort((a, b) => {
    if (a.online !== b.online) return b.online ? 1 : -1;
    return (a.nick || a.id).localeCompare(b.nick || b.id);
  });

  const getDisplayName = (agent: Agent): string => {
    const nick = agent.nick || agent.id;
    const shortId = agent.id.replace('@', '').slice(0, 6);
    if (nick === agent.id) return nick;
    return `${nick} (${shortId})`;
  };

  const channels = Object.values(state.channels);

  const handleJoinChannel = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = joinInput.trim();
    if (!raw) return;
    const channelName = raw.startsWith('#') ? raw : `#${raw}`;
    if (!/^#[a-zA-Z0-9_-]+$/.test(channelName)) return;
    send({ type: 'join_channel', data: { channel: channelName } });
    addSavedChannel(channelName);
    dispatch({ type: 'SELECT_CHANNEL', channel: channelName });
    setJoinInput('');
  };

  return (
    <div className="sidebar" style={{ width: sidebarWidth }}>
      <div className="section">
        <div className="sidebar-title-row">
          <h3>AGENTS ({agents.length})</h3>
          <label className="sidebar-toggle" title="Hide offline agents">
            <input
              type="checkbox"
              checked={state.hideOfflineAgents}
              onChange={(e) => dispatch({ type: 'SET_HIDE_OFFLINE_AGENTS', value: e.target.checked })}
            />
            Hide offline
          </label>
        </div>
        <div className="list">
          {agents.map(agent => (
            <div
              key={agent.id}
              className={`list-item ${state.selectedAgent?.id === agent.id ? 'selected' : ''}`}
              onClick={() => dispatch({ type: 'SELECT_AGENT', agent })}
            >
              <span className={`dot ${agent.online ? 'online' : 'offline'}`} />
              <span className="agent-type-icon" title={agent.isDashboard ? 'Dashboard user' : 'Agent'}>{agent.isDashboard ? '\uD83E\uDDD1' : '\uD83E\uDD16'}</span>
              <span className="nick" style={{ color: agentColor(agent.nick || agent.id) }}>
                {getDisplayName(agent)}
              </span>
              {agent.verified
                ? <span className="verified-badge" title="Verified (allowlisted)">&#x2713;</span>
                : <span className="unverified-badge" title="Unverified identity">&#x26A0;</span>
              }
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <h3>CHANNELS ({channels.length})</h3>
        <form className="channel-join-form" onSubmit={handleJoinChannel}>
          <input
            type="text"
            className="channel-join-input"
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value)}
            placeholder="Join channel..."
          />
          <button type="submit" className="channel-join-btn" title="Join channel">+</button>
        </form>
        <div className="list">
          {channels.map((channel, idx) => (
            <div
              key={channel.name}
              className={`list-item ${state.selectedChannel === channel.name ? 'selected' : ''}`}
              onClick={() => dispatch({ type: 'SELECT_CHANNEL', channel: channel.name })}
              title={idx < 9 ? `Alt+${idx + 1}` : undefined}
            >
              {idx < 9 && <kbd className="shortcut-hint">{idx + 1}</kbd>}
              <span className="channel-name">{channel.name}</span>
              {state.activityCounts[channel.name] > 0 && (
                <span className="activity-badge" title="Join/leave activity">{state.activityCounts[channel.name]}</span>
              )}
              {state.unreadCounts[channel.name] > 0 && (
                <span className="unread-badge">{state.unreadCounts[channel.name]}</span>
              )}
              <span className="member-count">{channel.members?.length || 0}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="quick-actions">
        <button onClick={() => dispatch({ type: 'SET_RIGHT_PANEL', panel: 'leaderboard' })}>Leaderboard</button>
        <button onClick={() => dispatch({ type: 'SET_RIGHT_PANEL', panel: 'skills' })}>Skills</button>
        <button onClick={() => dispatch({ type: 'SET_RIGHT_PANEL', panel: 'proposals' })}>Proposals</button>
        <button onClick={() => dispatch({ type: 'SET_RIGHT_PANEL', panel: 'disputes' })}>Disputes</button>
      </div>
    </div>
  );
}
