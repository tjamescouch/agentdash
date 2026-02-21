import { useState, useEffect, useCallback } from 'react';

const BOOT_LINES = [
  { text: 'AgentDash Hypervisor v2.1', cls: 'ok', delay: 0 },
  { text: '', cls: 'dim', delay: 80 },
  { text: 'Initializing virtual infrastructure...', cls: 'dim', delay: 100 },
  { text: 'Connecting to AgentChat network...', cls: 'dim', delay: 300 },
  { text: '  Server: wss://agentchat-server.fly.dev', cls: 'dim', delay: 400 },
  { text: '  Status: Connected', cls: 'ok', delay: 600 },
  { text: '', cls: 'dim', delay: 650 },
  { text: 'Loading modules:', cls: 'dim', delay: 700 },
  { text: '  Agent Manager        \u2713', cls: 'ok', delay: 780 },
  { text: '  Channel Monitor      \u2713', cls: 'ok', delay: 830 },
  { text: '  Proposal Tracker     \u2713', cls: 'ok', delay: 880 },
  { text: '  Reputation Engine    \u2713', cls: 'ok', delay: 930 },
  { text: '', cls: 'dim', delay: 980 },
  { text: 'Ready.', cls: 'ok', delay: 1050 },
];

export function BootSequence({ onComplete }: { onComplete: () => void }) {
  const [visibleLines, setVisibleLines] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);

  const stableOnComplete = useCallback(onComplete, [onComplete]);

  useEffect(() => {
    const booted = sessionStorage.getItem('agentdash-booted');
    if (booted) {
      stableOnComplete();
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    BOOT_LINES.forEach((line, i) => {
      timers.push(setTimeout(() => setVisibleLines(i + 1), line.delay));
    });

    const lastDelay = BOOT_LINES[BOOT_LINES.length - 1].delay;
    timers.push(setTimeout(() => {
      setFadeOut(true);
      sessionStorage.setItem('agentdash-booted', '1');
    }, lastDelay + 600));

    timers.push(setTimeout(() => {
      stableOnComplete();
    }, lastDelay + 1400));

    return () => timers.forEach(clearTimeout);
  }, [stableOnComplete]);

  const booted = typeof window !== 'undefined' && sessionStorage.getItem('agentdash-booted');
  if (booted) return null;

  return (
    <div className={`boot-overlay ${fadeOut ? 'fade-out' : ''}`}>
      {BOOT_LINES.slice(0, visibleLines).map((line, i) => (
        <div key={i} className={`boot-line ${line.cls}`}>
          {line.text}
        </div>
      ))}
      {visibleLines < BOOT_LINES.length && (
        <span className="boot-cursor" />
      )}
      {visibleLines >= BOOT_LINES.length && !fadeOut && (
        <span className="boot-cursor" />
      )}
    </div>
  );
}
