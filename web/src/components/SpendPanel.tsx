import { useEffect } from 'react';
import type { DashboardState, DashboardAction, WsSendFn } from '../types';
import { SpendGraphs } from './SpendGraphs';

export function SpendPanel({ state, dispatch, send }: { state: DashboardState; dispatch: React.Dispatch<DashboardAction>; send: WsSendFn }) {
  const spend = state.spend;

  useEffect(() => {
    if (!state.spendOpen) return;
    send({ type: 'get_spend', data: {} });
  }, [state.spendOpen, send]);

  if (!state.spendOpen) return null;

  const topAgents = Object.entries(spend.byAgent)
    .sort((a, b) => (b[1].totalTokens || 0) - (a[1].totalTokens || 0))
    .slice(0, 20);

  const topModels = Object.entries(spend.byModel)
    .sort((a, b) => (b[1].totalTokens || 0) - (a[1].totalTokens || 0))
    .slice(0, 20);

  return (
    <div className="logs-panel">
      <div className="logs-header">
        <span className="logs-title">SPEND / TOKENS</span>
        <div className="logs-actions">
          <button onClick={() => send({ type: 'get_spend', data: {} })}>Refresh</button>
          <button onClick={() => dispatch({ type: 'TOGGLE_SPEND' })}>Close</button>
        </div>
      </div>

      <div className="logs-body">
        <SpendGraphs buckets={spend.buckets1m || []} />
        <div className="log-line">
          <span className="log-ts">Total</span>
          <span className="log-msg">
            {spend.totalCalls} calls &bull; {spend.totalTokens} tokens ({spend.totalInputTokens} in / {spend.totalOutputTokens} out)
          </span>
        </div>

        <div className="log-line"><span className="log-ts">By agent</span><span className="log-msg" /></div>
        {topAgents.map(([agent, s]) => (
          <div key={agent} className="log-line">
            <span className="log-ts">{agent}</span>
            <span className="log-msg">{s.calls} calls &bull; {s.totalTokens} tokens ({s.inputTokens} in / {s.outputTokens} out)</span>
          </div>
        ))}

        <div className="log-line"><span className="log-ts">By model</span><span className="log-msg" /></div>
        {topModels.map(([model, s]) => (
          <div key={model} className="log-line">
            <span className="log-ts">{model}</span>
            <span className="log-msg">{s.calls} calls &bull; {s.totalTokens} tokens ({s.inputTokens} in / {s.outputTokens} out)</span>
          </div>
        ))}
      </div>
    </div>
  );
}
