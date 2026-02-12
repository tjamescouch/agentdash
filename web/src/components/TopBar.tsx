import type { DashboardState, DashboardAction, WsSendFn } from '../types';

export function TopBar({ state, dispatch, send }: { state: DashboardState; dispatch: React.Dispatch<DashboardAction>; send: WsSendFn }) {
  return (
    <div className="topbar">
      <div className="topbar-left">
        <span className="logo">AgentChat</span>
        <span className={`status ${state.connected ? 'online' : 'offline'}`}>
          {state.connected ? 'CONNECTED' : 'DISCONNECTED'}
        </span>
      </div>
      <div className="topbar-right">
        {state.dashboardAgent && (
          <span className="dashboard-nick">as {state.dashboardAgent.nick}</span>
        )}
        <button
          className="killswitch-btn"
          onClick={() => dispatch({ type: 'TOGGLE_KILLSWITCH' })}
          title="Emergency Kill Switch"
        >
          KILL
        </button>
        <button
          className={`pulse-btn ${state.pulseOpen ? 'active' : ''}`}
          onClick={() => dispatch({ type: 'TOGGLE_PULSE' })}
        >
          PULSE
        </button>
        <button
          className={`mode-btn ${state.mode}`}
          onClick={() => {
            const newMode = state.mode === 'lurk' ? 'participate' : 'lurk';
            const storedIdentity = typeof window !== 'undefined' ? localStorage.getItem('dashboardIdentity') : null;
            send({
              type: 'set_mode',
              data: {
                mode: newMode,
                ...(newMode === 'participate' && storedIdentity ? { identity: JSON.parse(storedIdentity) } : {})
              }
            });
          }}
        >
          {state.mode === 'lurk' ? 'LURK' : 'PARTICIPATE'}
        </button>
      </div>
    </div>
  );
}
