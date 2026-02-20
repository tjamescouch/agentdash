/**
 * Parse spend update messages from gro agents.
 * Format:
 *   💸 spend update [model-name]
 *     cost:    $0.1234
 *     rate:    $5.67/hr
 *     tokens:  123.4K total  45.6K/hr
 */

export interface ParsedSpend {
  model: string;
  cost: number;
  rate: number;
  totalTokens: number;
  tokensPerHour: number;
}

export function parseSpendMessage(content: string): ParsedSpend | null {
  if (!content.includes('💸 spend update')) return null;

  const modelMatch = content.match(/💸 spend update \[([^\]]+)\]/);
  const costMatch = content.match(/cost:\s*\$([0-9.]+)/);
  const rateMatch = content.match(/rate:\s*\$([0-9.]+)\/hr/);
  const tokensMatch = content.match(/tokens:\s*([0-9.]+)([KM])?\s*total\s*([0-9.]+)([KM])?\/hr/);

  if (!modelMatch || !costMatch || !rateMatch || !tokensMatch) return null;

  const parseTokenCount = (val: string, unit?: string): number => {
    const n = parseFloat(val);
    if (unit === 'K') return n * 1000;
    if (unit === 'M') return n * 1_000_000;
    return n;
  };

  return {
    model: modelMatch[1],
    cost: parseFloat(costMatch[1]),
    rate: parseFloat(rateMatch[1]),
    totalTokens: parseTokenCount(tokensMatch[1], tokensMatch[2]),
    tokensPerHour: parseTokenCount(tokensMatch[3], tokensMatch[4]),
  };
}
