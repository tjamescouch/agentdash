import type { DashboardState } from '../types';

export function LockdownOverlay({ state }: { state: DashboardState }) {
  if (!state.lockdown) return null;

  return (
    <div className="lockdown-overlay">
      <div className="lockdown-card">
        <div className="lockdown-icon">X</div>
        <div className="lockdown-title">SYSTEM LOCKDOWN</div>
        <div className="lockdown-subtitle">Kill switch activated</div>
        <div className="lockdown-detail">
          All agents terminated. Screen locked. Server shutting down.
        </div>
      </div>
    </div>
  );
}
