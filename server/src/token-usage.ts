/**
 * Token Usage Accumulator
 * 
 * Tracks per-agent, per-model token usage from the Anthropic proxy.
 * Designed as a standalone module — no coupling to the dashboard UI.
 * 
 * Data flow:
 *   Proxy intercepts API call → logs [TOKEN] → recordUsage() called → data accumulated
 *   Dashboard polls GET /api/usage → getUsageSummary() returns normalized data
 */

// ============ Types ============

export interface TokenEvent {
  agent: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  ts: number;
}

export interface ModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestCount: number;
}

export interface AgentUsage {
  agent: string;
  models: ModelUsage[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalRequests: number;
  firstSeen: number;
  lastSeen: number;
}

export interface UsageSummary {
  agents: AgentUsage[];
  totals: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    totalRequests: number;
  };
  windowStart: number;
  windowEnd: number;
}

export interface TimeSeriesPoint {
  ts: number;        // bucket timestamp (start of interval)
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestCount: number;
}

export interface AgentTimeSeries {
  agent: string;
  points: TimeSeriesPoint[];
}

// ============ Storage ============

const MAX_EVENTS = 50_000;        // ~50k events before pruning
const MAX_AGE_MS = 24 * 60 * 60 * 1000;  // 24h rolling window

const events: TokenEvent[] = [];

// ============ Core API ============

/**
 * Record a token usage event from the proxy.
 */
export function recordUsage(agent: string, model: string, inputTokens: number, outputTokens: number): void {
  const event: TokenEvent = {
    agent,
    model,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    ts: Date.now()
  };
  
  events.push(event);
  
  // Prune old events
  if (events.length > MAX_EVENTS) {
    const cutoff = Date.now() - MAX_AGE_MS;
    const firstValid = events.findIndex(e => e.ts >= cutoff);
    if (firstValid > 0) {
      events.splice(0, firstValid);
    } else if (firstValid === -1) {
      // All events are old — keep last 1000
      events.splice(0, events.length - 1000);
    }
  }
}

/**
 * Parse a [TOKEN] log line and record it.
 * Format: "[TOKEN] agentName called model: N input + N output = N total tokens"
 */
export function parseAndRecordTokenLog(msg: string): TokenEvent | null {
  const match = msg.match(/\[TOKEN\]\s+(\S+)\s+called\s+(\S+):\s+(\d+)\s+input\s+\+\s+(\d+)\s+output\s+=\s+(\d+)\s+total/);
  if (!match) return null;
  
  const [, agent, model, input, output] = match;
  const inputTokens = parseInt(input, 10);
  const outputTokens = parseInt(output, 10);
  
  recordUsage(agent, model, inputTokens, outputTokens);
  
  return {
    agent,
    model,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    ts: Date.now()
  };
}

/**
 * Get aggregated usage summary, optionally filtered by time window.
 */
export function getUsageSummary(windowMs?: number): UsageSummary {
  const now = Date.now();
  const cutoff = windowMs ? now - windowMs : 0;
  
  const filtered = events.filter(e => e.ts >= cutoff);
  
  // Aggregate per agent, per model
  const agentMap = new Map<string, {
    models: Map<string, ModelUsage>;
    totalInput: number;
    totalOutput: number;
    totalTokens: number;
    totalRequests: number;
    firstSeen: number;
    lastSeen: number;
  }>();
  
  for (const e of filtered) {
    let agent = agentMap.get(e.agent);
    if (!agent) {
      agent = {
        models: new Map(),
        totalInput: 0,
        totalOutput: 0,
        totalTokens: 0,
        totalRequests: 0,
        firstSeen: e.ts,
        lastSeen: e.ts
      };
      agentMap.set(e.agent, agent);
    }
    
    let model = agent.models.get(e.model);
    if (!model) {
      model = { model: e.model, inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 };
      agent.models.set(e.model, model);
    }
    
    model.inputTokens += e.inputTokens;
    model.outputTokens += e.outputTokens;
    model.totalTokens += e.totalTokens;
    model.requestCount++;
    
    agent.totalInput += e.inputTokens;
    agent.totalOutput += e.outputTokens;
    agent.totalTokens += e.totalTokens;
    agent.totalRequests++;
    if (e.ts < agent.firstSeen) agent.firstSeen = e.ts;
    if (e.ts > agent.lastSeen) agent.lastSeen = e.ts;
  }
  
  const agents: AgentUsage[] = [...agentMap.entries()]
    .map(([name, data]) => ({
      agent: name,
      models: [...data.models.values()].sort((a, b) => b.totalTokens - a.totalTokens),
      totalInputTokens: data.totalInput,
      totalOutputTokens: data.totalOutput,
      totalTokens: data.totalTokens,
      totalRequests: data.totalRequests,
      firstSeen: data.firstSeen,
      lastSeen: data.lastSeen
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens);
  
  const totals = {
    inputTokens: agents.reduce((s, a) => s + a.totalInputTokens, 0),
    outputTokens: agents.reduce((s, a) => s + a.totalOutputTokens, 0),
    totalTokens: agents.reduce((s, a) => s + a.totalTokens, 0),
    totalRequests: agents.reduce((s, a) => s + a.totalRequests, 0)
  };
  
  return {
    agents,
    totals,
    windowStart: cutoff || (filtered.length > 0 ? filtered[0].ts : now),
    windowEnd: now
  };
}

/**
 * Get usage for a specific agent.
 */
export function getAgentUsage(agentName: string, windowMs?: number): AgentUsage | null {
  const summary = getUsageSummary(windowMs);
  return summary.agents.find(a => a.agent === agentName) || null;
}

/**
 * Get time-series data for charting, bucketed by interval.
 */
export function getTimeSeries(
  intervalMs: number = 5 * 60 * 1000,  // 5 min default
  windowMs?: number,
  agentName?: string
): AgentTimeSeries[] {
  const now = Date.now();
  const cutoff = windowMs ? now - windowMs : (events.length > 0 ? events[0].ts : now);
  
  const filtered = events.filter(e => 
    e.ts >= cutoff && (!agentName || e.agent === agentName)
  );
  
  if (filtered.length === 0) return [];
  
  // Group by agent
  const byAgent = new Map<string, TokenEvent[]>();
  for (const e of filtered) {
    const list = byAgent.get(e.agent) || [];
    list.push(e);
    byAgent.set(e.agent, list);
  }
  
  const result: AgentTimeSeries[] = [];
  
  for (const [agent, agentEvents] of byAgent) {
    const buckets = new Map<number, TimeSeriesPoint>();
    
    for (const e of agentEvents) {
      const bucketTs = Math.floor(e.ts / intervalMs) * intervalMs;
      let bucket = buckets.get(bucketTs);
      if (!bucket) {
        bucket = { ts: bucketTs, inputTokens: 0, outputTokens: 0, totalTokens: 0, requestCount: 0 };
        buckets.set(bucketTs, bucket);
      }
      bucket.inputTokens += e.inputTokens;
      bucket.outputTokens += e.outputTokens;
      bucket.totalTokens += e.totalTokens;
      bucket.requestCount++;
    }
    
    result.push({
      agent,
      points: [...buckets.values()].sort((a, b) => a.ts - b.ts)
    });
  }
  
  return result.sort((a, b) => {
    const aTotal = a.points.reduce((s, p) => s + p.totalTokens, 0);
    const bTotal = b.points.reduce((s, p) => s + p.totalTokens, 0);
    return bTotal - aTotal;
  });
}

/**
 * Get raw event count (for diagnostics).
 */
export function getEventCount(): number {
  return events.length;
}

/**
 * Clear all stored events (for testing).
 */
export function clearEvents(): void {
  events.length = 0;
}
