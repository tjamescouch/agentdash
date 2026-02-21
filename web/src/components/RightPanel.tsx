import { useState, FormEvent } from 'react';
import type { DashboardState, DashboardAction, WsSendFn } from '../types';
import { agentColor, safeUrl, formatTime } from '../utils';

export function RightPanel({ state, dispatch, send, panelWidth }: { state: DashboardState; dispatch: React.Dispatch<DashboardAction>; send: WsSendFn; panelWidth: number }) {
  const panelStyle = { width: panelWidth };
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [skillsFilter, setSkillsFilter] = useState('');

  if (state.rightPanel === 'leaderboard') {
    return (
      <div className="right-panel" style={panelStyle}>
        <h3>LEADERBOARD</h3>
        <div className="leaderboard">
          {state.leaderboard.map((entry, i) => (
            <div key={entry.id} className="leaderboard-entry">
              <span className="rank">#{i + 1}</span>
              <span className="nick" style={{ color: agentColor(entry.nick || entry.id) }}>
                {entry.nick || entry.id}
              </span>
              <span className="agent-id">{entry.id}</span>
              <span className="elo">{entry.elo}</span>
            </div>
          ))}
          {state.leaderboard.length === 0 && <div className="empty">No agents rated yet</div>}
        </div>
      </div>
    );
  }

  if (state.rightPanel === 'skills') {
    const filteredSkills = state.skills.filter(s =>
      !skillsFilter ||
      s.capability.toLowerCase().includes(skillsFilter.toLowerCase()) ||
      (s.description && s.description.toLowerCase().includes(skillsFilter.toLowerCase()))
    );
    return (
      <div className="right-panel" style={panelStyle}>
        <h3>SKILLS MARKETPLACE</h3>
        <input
          type="text"
          className="skills-search"
          value={skillsFilter}
          onChange={(e) => setSkillsFilter(e.target.value)}
          placeholder="Filter by capability..."
        />
        <div className="skills">
          {filteredSkills.map((skill, i) => (
            <div key={i} className="skill-entry">
              <div className="skill-header">
                <span className="capability">{skill.capability}</span>
                <span className="rate">{skill.rate} {skill.currency}</span>
              </div>
              <div className="skill-agent">{skill.agentId}</div>
              <div className="skill-desc">{skill.description}</div>
            </div>
          ))}
          {filteredSkills.length === 0 && <div className="empty">{skillsFilter ? 'No matching skills' : 'No skills registered'}</div>}
        </div>
      </div>
    );
  }

  if (state.rightPanel === 'proposals') {
    const proposals = Object.values(state.proposals);
    return (
      <div className="right-panel" style={panelStyle}>
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
                <span className="arrow"> &rarr; </span>
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

  if (state.rightPanel === 'disputes') {
    const disputes = Object.values(state.disputes).sort((a, b) => b.updated_at - a.updated_at);
    return (
      <div className="right-panel" style={panelStyle}>
        <h3>DISPUTES ({disputes.length})</h3>
        <div className="disputes">
          {disputes.map(d => (
            <div
              key={d.id}
              className={`dispute-entry phase-${d.phase}`}
              onClick={() => dispatch({ type: 'SET_RIGHT_PANEL', panel: `dispute:${d.id}` })}
            >
              <div className="dispute-header">
                <span className={`phase-badge ${d.phase}`}>{d.phase}</span>
                {d.verdict && <span className={`verdict-badge ${d.verdict}`}>{d.verdict}</span>}
              </div>
              <div className="dispute-reason">{d.reason.length > 60 ? d.reason.slice(0, 60) + '...' : d.reason}</div>
              <div className="dispute-parties">
                <span style={{ color: agentColor(state.agents[d.disputant]?.nick || d.disputant) }}>
                  {state.agents[d.disputant]?.nick || d.disputant}
                </span>
                <span className="vs"> vs </span>
                <span style={{ color: agentColor(state.agents[d.respondent]?.nick || d.respondent) }}>
                  {state.agents[d.respondent]?.nick || d.respondent}
                </span>
              </div>
              <div className="dispute-meta">
                <span className="time">{formatTime(d.created_at)}</span>
                <span className="arbiter-count">{d.arbiters.filter(a => a.status === 'accepted').length}/3 arbiters</span>
              </div>
            </div>
          ))}
          {disputes.length === 0 && <div className="empty">No active disputes</div>}
        </div>
      </div>
    );
  }

  if (state.rightPanel.startsWith('dispute:')) {
    const disputeId = state.rightPanel.slice('dispute:'.length);
    const dispute = state.disputes[disputeId];
    if (!dispute) {
      return (
        <div className="right-panel" style={panelStyle}>
          <button className="back-btn" onClick={() => dispatch({ type: 'SET_RIGHT_PANEL', panel: 'disputes' })}>Back to Disputes</button>
          <div className="empty">Dispute not found</div>
        </div>
      );
    }

    const getAgentName = (id: string) => state.agents[id]?.nick || id;

    return (
      <div className="right-panel dispute-detail" style={panelStyle}>
        <button className="back-btn" onClick={() => dispatch({ type: 'SET_RIGHT_PANEL', panel: 'disputes' })}>Back to Disputes</button>
        <h3>DISPUTE DETAIL</h3>

        <div className="dispute-phase-bar">
          <span className={`phase-badge ${dispute.phase}`}>{dispute.phase.replace('_', ' ')}</span>
          {dispute.verdict && <span className={`verdict-badge ${dispute.verdict}`}>Verdict: {dispute.verdict}</span>}
        </div>

        <div className="dispute-section">
          <div className="section-label">Parties</div>
          <div className="dispute-parties-detail">
            <div className="party disputant">
              <span className="party-role">Disputant</span>
              <span className="party-name" style={{ color: agentColor(getAgentName(dispute.disputant)) }}>
                {getAgentName(dispute.disputant)}
              </span>
            </div>
            <span className="vs">vs</span>
            <div className="party respondent">
              <span className="party-role">Respondent</span>
              <span className="party-name" style={{ color: agentColor(getAgentName(dispute.respondent)) }}>
                {getAgentName(dispute.respondent)}
              </span>
            </div>
          </div>
        </div>

        <div className="dispute-section">
          <div className="section-label">Reason</div>
          <div className="dispute-reason-full">{dispute.reason}</div>
        </div>

        <div className="dispute-section">
          <div className="section-label">Arbiter Panel</div>
          <div className="arbiter-panel">
            {dispute.arbiters.map((a, i) => (
              <div key={i} className={`arbiter-slot status-${a.status}`}>
                <span className="arbiter-name" style={{ color: agentColor(getAgentName(a.agent_id)) }}>
                  {getAgentName(a.agent_id)}
                </span>
                <span className={`arbiter-status ${a.status}`}>{a.status}</span>
                {a.vote && (
                  <div className="arbiter-vote-info">
                    <span className={`vote-verdict ${a.vote.verdict}`}>{a.vote.verdict}</span>
                    <span className="vote-reasoning">{a.vote.reasoning}</span>
                  </div>
                )}
              </div>
            ))}
            {dispute.arbiters.length === 0 && <div className="empty">Panel not yet formed</div>}
          </div>
        </div>

        {(dispute.disputant_evidence || dispute.respondent_evidence) && (
          <div className="dispute-section">
            <div className="section-label">Evidence</div>
            {dispute.disputant_evidence && (
              <div className="evidence-block">
                <div className="evidence-party">
                  <span style={{ color: agentColor(getAgentName(dispute.disputant)) }}>
                    {getAgentName(dispute.disputant)}
                  </span>
                  <span className="evidence-count">({dispute.disputant_evidence.items.length} items)</span>
                </div>
                <div className="evidence-statement">{dispute.disputant_evidence.statement}</div>
                <div className="evidence-items">
                  {dispute.disputant_evidence.items.map((item, i) => (
                    <div key={i} className="evidence-item">
                      <span className={`evidence-kind ${item.kind}`}>{item.kind}</span>
                      <span className="evidence-label">{item.label}</span>
                      {item.url && safeUrl(item.url) && <a href={safeUrl(item.url)!} target="_blank" rel="noopener noreferrer" className="evidence-link">View</a>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {dispute.respondent_evidence && (
              <div className="evidence-block">
                <div className="evidence-party">
                  <span style={{ color: agentColor(getAgentName(dispute.respondent)) }}>
                    {getAgentName(dispute.respondent)}
                  </span>
                  <span className="evidence-count">({dispute.respondent_evidence.items.length} items)</span>
                </div>
                <div className="evidence-statement">{dispute.respondent_evidence.statement}</div>
                <div className="evidence-items">
                  {dispute.respondent_evidence.items.map((item, i) => (
                    <div key={i} className="evidence-item">
                      <span className={`evidence-kind ${item.kind}`}>{item.kind}</span>
                      <span className="evidence-label">{item.label}</span>
                      {item.url && safeUrl(item.url) && <a href={safeUrl(item.url)!} target="_blank" rel="noopener noreferrer" className="evidence-link">View</a>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {dispute.rating_changes && Object.keys(dispute.rating_changes).length > 0 && (
          <div className="dispute-section">
            <div className="section-label">Rating Changes</div>
            <div className="rating-changes">
              {Object.entries(dispute.rating_changes).map(([agentId, change]) => (
                <div key={agentId} className={`rating-change ${change.delta > 0 ? 'positive' : change.delta < 0 ? 'negative' : 'neutral'}`}>
                  <span className="rating-agent" style={{ color: agentColor(getAgentName(agentId)) }}>
                    {getAgentName(agentId)}
                  </span>
                  <span className="rating-delta">{change.delta > 0 ? '+' : ''}{change.delta}</span>
                  <span className="rating-value">{change.old} &rarr; {change.new}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="dispute-section">
          <div className="section-label">Timeline</div>
          <div className="dispute-timeline">
            <div className="timeline-entry">Filed: {new Date(dispute.created_at).toLocaleString()}</div>
            {dispute.evidence_deadline && (
              <div className="timeline-entry">Evidence deadline: {new Date(dispute.evidence_deadline).toLocaleString()}</div>
            )}
            {dispute.vote_deadline && (
              <div className="timeline-entry">Vote deadline: {new Date(dispute.vote_deadline).toLocaleString()}</div>
            )}
            {dispute.resolved_at && (
              <div className="timeline-entry">Resolved: {new Date(dispute.resolved_at).toLocaleString()}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Agent detail
  const agent = state.selectedAgent;

  if (!agent) {
    return (
      <div className="right-panel" style={panelStyle}>
        <div className="empty">Select an agent to view details</div>
      </div>
    );
  }

  const handleRename = (e: FormEvent) => {
    e.preventDefault();
    if (renameValue.trim()) {
      send({ type: 'set_agent_name', data: { agentId: agent.id, name: renameValue.trim() } });
      setIsRenaming(false);
      setRenameValue('');
    }
  };

  const agentElo = state.leaderboard.find(e => e.id === agent.id);
  const agentProposals = Object.values(state.proposals).filter(
    p => p.from === agent.id || p.to === agent.id
  );

  return (
    <div className="right-panel" style={panelStyle}>
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
            {agent.nick || agent.id}
          </div>
        )}
        <div className="detail-id">
          <span className="agent-type-icon">{agent.isDashboard ? '\uD83E\uDDD1' : '\uD83E\uDD16'}</span>
          {agent.id}
          {agent.verified
            ? <span className="verified-badge" title="Verified (allowlisted)"> &#x2713;</span>
            : <span className="unverified-badge" title="Unverified identity"> &#x26A0;</span>
          }
        </div>
        <div className={`detail-status ${agent.online ? 'online' : 'offline'}`}>
          {agent.online ? 'Online' : 'Offline'}
          {agent.verified
            ? <span className="verified-badge-detail">Verified</span>
            : <span className="unverified-badge-detail">Unverified</span>
          }
        </div>
        {agentElo && (
          <div className="detail-elo">
            <span className="label">ELO:</span>
            <span className="elo-value">{agentElo.elo}</span>
          </div>
        )}
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
        {agentProposals.length > 0 && (
          <div className="detail-proposals">
            <span className="label">Proposals:</span>
            {agentProposals.slice(0, 5).map(p => (
              <div key={p.id} className={`detail-proposal status-${p.status}`}>
                <span className={`status-badge ${p.status}`}>{p.status}</span>
                <span className="proposal-task-summary">{p.task.length > 40 ? p.task.slice(0, 40) + '...' : p.task}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
