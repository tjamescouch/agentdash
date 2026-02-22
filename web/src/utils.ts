import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ breaks: false });

// Redact strings that look like API keys, tokens, or passwords
const SECRET_PATTERNS: [RegExp, string][] = [
  // Anthropic keys
  [/\bsk-ant-[A-Za-z0-9_-]{20,}\b/g, '\u{1F512} [anthropic-key-redacted]'],
  // OpenAI keys
  [/\bsk-[A-Za-z0-9]{20,}\b/g, '\u{1F512} [openai-key-redacted]'],
  // GitHub tokens
  [/\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g, '\u{1F512} [github-token-redacted]'],
  // AWS keys
  [/\bAKIA[A-Z0-9]{16}\b/g, '\u{1F512} [aws-key-redacted]'],
  // Generic bearer tokens (long base64-ish strings after "Bearer")
  [/\bBearer\s+[A-Za-z0-9_-]{30,}\b/g, '\u{1F512} [bearer-token-redacted]'],
  // Private keys (hex-encoded, 0x-prefixed, 64 hex chars)
  [/\b0x[0-9a-f]{64}\b/gi, '\u{1F512} [private-key-redacted]'],
  // Slack tokens
  [/\bxox[bpsar]-[A-Za-z0-9-]{20,}\b/g, '\u{1F512} [slack-token-redacted]'],
  // npm tokens
  [/\bnpm_[A-Za-z0-9]{20,}\b/g, '\u{1F512} [npm-token-redacted]'],
];

export function redactSecrets(text: string): string {
  let result = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function renderMarkdown(content: string): string {
  const raw = marked.parse(content);
  const html = typeof raw === 'string' ? raw : '';
  return DOMPurify.sanitize(html);
}

export function agentColor(nick: string): string {
  const hash = (nick || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 60%)`;
}

export function safeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url;
    return null;
  } catch { return null; }
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  const time = d.toLocaleTimeString('en-US', { hour12: false });
  if (diffDays === 0 && d.getDate() === now.getDate()) return time;
  if (diffDays < 7) {
    const day = d.toLocaleDateString('en-US', { weekday: 'short' });
    return `${day} ${time}`;
  }
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${date} ${time}`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function truncateAtWord(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const truncated = text.slice(0, limit);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > limit * 0.7 ? truncated.slice(0, lastSpace) : truncated) + '...';
}
