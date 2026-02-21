import { useState, useEffect, useRef, FormEvent } from 'react';
import type { DashboardState, DashboardAction } from '../../types';

export function KillSwitchModal({ state, dispatch }: { state: DashboardState; dispatch: React.Dispatch<DashboardAction> }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.killSwitchOpen) {
      setPin('');
      setError('');
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [state.killSwitchOpen]);

  if (!state.killSwitchOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pin || loading) return;

    setLoading(true);
    setError('');

    try {
      const baseUrl = import.meta.env.DEV ? 'http://localhost:3000' : '';
      const resp = await fetch(`${baseUrl}/api/killswitch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });

      if (resp.ok) {
        dispatch({ type: 'LOCKDOWN' });
      } else {
        const data = await resp.json().catch(() => ({ error: 'Request failed' }));
        setError(data.error || 'Invalid PIN');
        setPin('');
        setLoading(false);
        inputRef.current?.focus();
      }
    } catch {
      setError('Connection failed');
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay killswitch-overlay" onClick={() => dispatch({ type: 'TOGGLE_KILLSWITCH' })}>
      <div className="modal killswitch-modal" onClick={e => e.stopPropagation()}>
        <div className="killswitch-icon">!</div>
        <h3>KILL SWITCH</h3>
        <p className="killswitch-warning">
          This will terminate all agents, lock the screen, and shut down the server.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="password"
            className="killswitch-pin-input"
            value={pin}
            onChange={e => setPin(e.target.value)}
            placeholder="ENTER PIN"
            maxLength={20}
            autoComplete="off"
            disabled={loading}
          />
          {error && <div className="killswitch-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="modal-btn cancel" onClick={() => dispatch({ type: 'TOGGLE_KILLSWITCH' })}>
              Cancel
            </button>
            <button type="submit" className="modal-btn killswitch-confirm" disabled={!pin || loading}>
              {loading ? 'EXECUTING...' : 'CONFIRM LOCKDOWN'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
