import { useState, useEffect, useRef, useMemo } from 'react';
import type { DashboardState, DashboardAction, WsSendFn } from '../../types';

export function AgentControlModal({ state, dispatch, send: _send }: { state: DashboardState; dispatch: React.Dispatch<DashboardAction>; send: WsSendFn }) {
  const [passphrase, setPassphrase] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [action, setAction] = useState<'stop' | 'start' | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.agentControlOpen) {
      setPassphrase('');
      setSelectedAgent(null);
      setAction(null);
      setError('');
      setLoading(false);
      setSuccess('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [state.agentControlOpen]);

  const onlineAgents = useMemo(() =>
    Object.values(state.agents)
      .filter(a => a.online && !a.isDashboard)
      .sort((a, b) => (a.nick || a.id).localeCompare(b.nick || b.id)),
    [state.agents]
  );

  if (!state.agentControlOpen) return null;

  const handleAction = async (actionType: 'stop' | 'start') => {
    if (!passphrase || passphrase.length < 8) {
      setError('Passphrase must be at least 8 characters');
      return;
    }
    if (actionType === 'stop' && !selectedAgent) {
      setError('Select an agent to stop');
      return;
    }

    setLoading(true);
    setAction(actionType);
    setError('');
    setSuccess('');

    try {
      const baseUrl = import.meta.env.DEV ? 'http://localhost:3000' : '';
      const resp = await fetch(`${baseUrl}/api/agent/${actionType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passphrase,
          agentId: selectedAgent,
        }),
      });

      const data = await resp.json().catch(() => ({ error: 'Request failed' }));

      if (resp.ok) {
        setSuccess(data.message || `Agent ${actionType === 'stop' ? 'stopped' : 'started'} successfully`);
        setPassphrase('');
        setTimeout(() => {
          dispatch({ type: 'TOGGLE_AGENT_CONTROL' });
        }, 1500);
      } else {
        setError(data.error || `Failed to ${actionType} agent`);
        setPassphrase('');
        setLoading(false);
        inputRef.current?.focus();
      }
    } catch {
      setError('Connection failed');
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay agent-control-overlay" onClick={() => dispatch({ type: 'TOGGLE_AGENT_CONTROL' })}>
      <div className="modal agent-control-modal" onClick={e => e.stopPropagation()}>
        <div className="agent-control-icon">&#9889;</div>
        <h3>AGENT CONTROL</h3>
        <p className="agent-control-warning">
          Start or stop agents on the network. Requires admin passphrase.
        </p>

        {onlineAgents.length > 0 && (
          <div className="agent-list-control">
            {onlineAgents.map(agent => (
              <div
                key={agent.id}
                className={`agent-list-item ${selectedAgent === agent.id ? 'selected' : ''}`}
                onClick={() => setSelectedAgent(agent.id === selectedAgent ? null : agent.id)}
              >
                <div>
                  <span className="agent-name">{agent.nick || agent.id}</span>
                  <span className="agent-id-small"> {agent.id}</span>
                </div>
                <span className="agent-status-badge online">ONLINE</span>
              </div>
            ))}
          </div>
        )}

        {onlineAgents.length === 0 && (
          <p className="agent-control-warning">No agents currently online.</p>
        )}

        <input
          ref={inputRef}
          type="password"
          className="agent-control-passphrase"
          value={passphrase}
          onChange={e => setPassphrase(e.target.value)}
          placeholder="Enter admin passphrase"
          autoComplete="off"
          disabled={loading}
        />
        <div className="passphrase-hint">Min 8 characters required</div>

        {error && <div className="agent-control-error">{error}</div>}
        {success && <div style={{ color: '#28c840', fontSize: '11px', marginTop: '8px' }}>{success}</div>}

        <div className="agent-control-actions">
          <button
            type="button"
            className="modal-btn cancel"
            onClick={() => dispatch({ type: 'TOGGLE_AGENT_CONTROL' })}
          >
            Cancel
          </button>
          <button
            type="button"
            className="modal-btn stop-btn"
            disabled={!selectedAgent || !passphrase || passphrase.length < 8 || loading}
            onClick={() => handleAction('stop')}
          >
            {loading && action === 'stop' ? 'STOPPING...' : 'STOP'}
          </button>
          <button
            type="button"
            className="modal-btn start-btn"
            disabled={!passphrase || passphrase.length < 8 || loading}
            onClick={() => handleAction('start')}
          >
            {loading && action === 'start' ? 'STARTING...' : 'START'}
          </button>
        </div>
      </div>
    </div>
  );
}
