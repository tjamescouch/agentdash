import { useState, useEffect, useRef, useMemo } from 'react';
import type { DashboardState, DashboardAction, WsSendFn } from '../../types';

const MODEL_OPTIONS = [
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
  'claude-3-5-haiku-20241022',
];

const RUNTIME_OPTIONS = [
  'claude-code',
  'raw-api',
  'thesystem',
];

export function AgentControlModal({ state, dispatch, send: _send }: { state: DashboardState; dispatch: React.Dispatch<DashboardAction>; send: WsSendFn }) {
  const [passphrase, setPassphrase] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [model, setModel] = useState(MODEL_OPTIONS[0]);
  const [runtime, setRuntime] = useState(RUNTIME_OPTIONS[0]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState<'stop' | 'start' | null>(null);
  const [success, setSuccess] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.agentControlOpen) {
      setPassphrase('');
      setSelectedAgent(null);
      setModel(MODEL_OPTIONS[0]);
      setRuntime(RUNTIME_OPTIONS[0]);
      setError('');
      setLoading(false);
      setLoadingAction(null);
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
    setLoadingAction(actionType);
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
          ...(actionType === 'start' ? { model, runtime } : {}),
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
        setLoadingAction(null);
        inputRef.current?.focus();
      }
    } catch {
      setError('Connection failed');
      setLoading(false);
      setLoadingAction(null);
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

        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '10px', color: '#666', display: 'block', marginBottom: '4px' }}>MODEL</label>
            <select
              className="agent-control-select"
              value={model}
              onChange={e => setModel(e.target.value)}
              disabled={loading}
              style={{ marginBottom: 0 }}
            >
              {MODEL_OPTIONS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '10px', color: '#666', display: 'block', marginBottom: '4px' }}>RUNTIME</label>
            <select
              className="agent-control-select"
              value={runtime}
              onChange={e => setRuntime(e.target.value)}
              disabled={loading}
              style={{ marginBottom: 0 }}
            >
              {RUNTIME_OPTIONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>

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
        <div className="passphrase-hint">Min 8 characters. Verified against SHA-256 hash.</div>

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
            {loading && loadingAction === 'stop' ? 'STOPPING...' : 'STOP AGENT'}
          </button>
          <button
            type="button"
            className="modal-btn start-btn"
            disabled={!passphrase || passphrase.length < 8 || loading}
            onClick={() => handleAction('start')}
          >
            {loading && loadingAction === 'start' ? 'STARTING...' : 'START AGENT'}
          </button>
        </div>
      </div>
    </div>
  );
}
