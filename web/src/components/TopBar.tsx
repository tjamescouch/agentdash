import { getOrCreateIdentity } from '../identity';
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
          className="agent-control-btn"
          onClick={() => dispatch({ type: 'TOGGLE_AGENT_CONTROL' })}
          title="Agent Control Panel"
        >
          AGENTS
        </button>
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
          className={`logs-btn ${state.spendOpen ? 'active' : ''}`}
          onClick={() => {
            const next = !state.spendOpen;
            dispatch({ type: 'TOGGLE_SPEND' });
            if (next) send({ type: 'get_spend', data: {} });
          }}
          title="Token usage / spend analytics (from proxy logs)"
        >
          SPEND
        </button>
        <button
          className={`mode-btn ${state.mode}`}
          onClick={async () => {
            const newMode = state.mode === 'lurk' ? 'participate' : 'lurk';
            const identity = newMode === 'participate' ? await getOrCreateIdentity() : null;
            send({
              type: 'set_mode',
              data: {
                mode: newMode,
                ...(identity ? { identity } : {})
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
