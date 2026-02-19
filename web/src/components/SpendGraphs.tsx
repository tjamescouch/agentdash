import { useMemo } from 'react';

type Bucket = { t: number; inputTokens: number; outputTokens: number; totalTokens: number; calls: number };

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function maxOf(arr: number[]): number {
  return arr.reduce((m, x) => (x > m ? x : m), 0);
}

export function SpendGraphs({ buckets }: { buckets: Bucket[] }) {
  const series = useMemo(() => {
    const last = buckets.slice(-60); // last hour
    const maxTokens = Math.max(1, maxOf(last.map((b) => b.totalTokens)));
    return { last, maxTokens };
  }, [buckets]);

  if (!buckets?.length) {
    return <div className="spend-empty">No spend data yet.</div>;
  }

  return (
    <div className="spend-graphs">
      <div className="spend-graph">
        <div className="spend-graph-title">Token burn (last 60m)</div>
        <div className="spark-bars" title="Tokens per minute">
          {series.last.map((b) => {
            const h = Math.round((b.totalTokens / series.maxTokens) * 100);
            return (
              <div key={b.t} className="spark-bar" title={`${formatTime(b.t)} · ${b.totalTokens} tok · ${b.calls} calls`}>
                <div className="spark-bar-fill" style={{ height: `${h}%` }} />
              </div>
            );
          })}
        </div>
        <div className="spend-graph-footer">
          <span>max {series.maxTokens} tok/min</span>
          <span>latest {series.last[series.last.length - 1]?.totalTokens ?? 0} tok/min</span>
        </div>
      </div>
    </div>
  );
}

