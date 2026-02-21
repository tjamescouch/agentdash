import { useState, useEffect, useRef, FormEvent } from 'react';
import type { DashboardState, DashboardAction, WsSendFn } from '../types';
import { renderMarkdown, agentColor, formatTime, formatSize, truncateAtWord } from '../utils';
import { FileOfferBanner, TransferBar } from './FileTransfer';

const MSG_TRUNCATE_LENGTH = 500;

// Highlight search matches in HTML string (only in text nodes, not in tags/attributes)
function highlightHtml(html: string, query: string): string {
  if (!query) return html;
  return html.replace(/(<[^>]*>)|([^<]+)/g, (match, tag, text) => {
    if (tag) return tag;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="search-highlight">$1</mark>');
  });
}

function MessageContent({ content, searchQuery }: { content: string; searchQuery?: string }) {
  const [expanded, setExpanded] = useState(false);
  const needsTruncation = content.length > MSG_TRUNCATE_LENGTH;
  const displayText = needsTruncation && !expanded
    ? truncateAtWord(content, MSG_TRUNCATE_LENGTH) + '...'
    : content;
  let html = renderMarkdown(displayText);
  if (searchQuery) {
    html = highlightHtml(html, searchQuery);
  }
  return (
    <span className="content">
      <span dangerouslySetInnerHTML={{ __html: html }} />
      {needsTruncation && (
        <button
          className="expand-btn"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </span>
  );
}

export function MessageFeed({ state, dispatch, send }: { state: DashboardState; dispatch: React.Dispatch<DashboardAction>; send: WsSendFn }) {
  const [input, setInput] = useState('');
  const [hideServer, setHideServer] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const allMessages = state.messages[state.selectedChannel] || [];
  const filteredByServer = hideServer
    ? allMessages.filter(m => m.from !== '@server')
    : allMessages;

  // Search filtering
  const searchLower = searchQuery.toLowerCase().trim();
  const messages = searchLower
    ? filteredByServer.filter(m => {
        const nick = state.agents[m.from]?.nick || m.fromNick || m.from;
        return m.content.toLowerCase().includes(searchLower) ||
               nick.toLowerCase().includes(searchLower) ||
               m.from.toLowerCase().includes(searchLower);
      })
    : filteredByServer;

  const matchCount = searchLower ? messages.length : 0;

  // Keyboard shortcut: Ctrl+F / Cmd+F to toggle search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(prev => {
          if (!prev) {
            setTimeout(() => searchInputRef.current?.focus(), 50);
          } else {
            setSearchQuery('');
            setActiveMatchIndex(0);
          }
          return !prev;
        });
      }
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        setSearchQuery('');
        setActiveMatchIndex(0);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSearch]);

  // Reset active match when query or results change
  useEffect(() => {
    setActiveMatchIndex(0);
  }, [searchQuery]);

  // Scroll to active match
  useEffect(() => {
    if (!searchLower || matchCount === 0) return;
    const container = messagesContainerRef.current;
    if (!container) return;
    const matchElements = container.querySelectorAll('.message.search-match');
    const target = matchElements[activeMatchIndex];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeMatchIndex, searchLower, matchCount]);

  const nextMatch = () => setActiveMatchIndex(i => (i + 1) % Math.max(1, matchCount));
  const prevMatch = () => setActiveMatchIndex(i => (i - 1 + matchCount) % Math.max(1, matchCount));

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
    setIsAtBottom(atBottom);
  };

  useEffect(() => {
    if (isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isAtBottom]);

  useEffect(() => {
    setIsAtBottom(true);
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [state.selectedChannel]);

  const hasTypists = Object.keys(state.typingAgents).length > 0;
  useEffect(() => {
    if (!hasTypists) return;
    const interval = setInterval(() => {
      const now = Date.now();
      Object.entries(state.typingAgents).forEach(([key, ts]) => {
        if (now - ts > 4000) {
          dispatch({ type: 'CLEAR_TYPING', agentId: key });
        }
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [hasTypists, state.typingAgents, dispatch]);

  const typingInChannel = Object.entries(state.typingAgents)
    .filter(([key, ts]) => key.endsWith(`:${state.selectedChannel}`) && Date.now() - ts < 4000)
    .map(([key]) => {
      const agentId = key.split(':')[0];
      return state.agents[agentId]?.nick || agentId;
    });

  const jumpToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setIsAtBottom(true);
  };

  const handleSend = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || state.mode === 'lurk') return;
    if (input.trim().startsWith('/nick ')) {
      const newNick = input.trim().slice(6).trim();
      if (newNick) {
        send({ type: 'set_nick', data: { nick: newNick } });
        localStorage.setItem('dashboardNick', newNick);
      }
      setInput('');
      return;
    }
    send({ type: 'send_message', data: { to: state.selectedChannel, content: input } });
    setInput('');
    setIsAtBottom(true);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="message-feed">
      <div className="feed-header">
        <span className="channel-title">{state.selectedChannel || 'Select a channel'}</span>
        <div className="feed-header-right">
          <button
            className={`search-toggle-btn${showSearch ? ' active' : ''}`}
            onClick={() => {
              setShowSearch(prev => {
                if (!prev) setTimeout(() => searchInputRef.current?.focus(), 50);
                else { setSearchQuery(''); setActiveMatchIndex(0); }
                return !prev;
              });
            }}
            title="Search messages (Ctrl+F)"
          >
            &#x1F50D;
          </button>
          <label className="server-toggle">
            <input
              type="checkbox"
              checked={hideServer}
              onChange={(e) => setHideServer(e.target.checked)}
            />
            Hide @server
          </label>
        </div>
      </div>
      {showSearch && (
        <div className="search-bar">
          <input
            ref={searchInputRef}
            type="text"
            className="search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) prevMatch(); else nextMatch();
              }
              if (e.key === 'Escape') {
                setShowSearch(false);
                setSearchQuery('');
                setActiveMatchIndex(0);
              }
            }}
            placeholder="Search messages..."
          />
          {searchLower && (
            <span className="search-count">
              {matchCount > 0 ? `${activeMatchIndex + 1}/${matchCount}` : '0 results'}
            </span>
          )}
          {matchCount > 1 && (
            <>
              <button className="search-nav-btn" onClick={prevMatch} title="Previous (Shift+Enter)">&#x25B2;</button>
              <button className="search-nav-btn" onClick={nextMatch} title="Next (Enter)">&#x25BC;</button>
            </>
          )}
          <button
            className="search-close-btn"
            onClick={() => { setShowSearch(false); setSearchQuery(''); setActiveMatchIndex(0); }}
          >
            &#x2715;
          </button>
        </div>
      )}
      <FileOfferBanner state={state} dispatch={dispatch} send={send} />
      <TransferBar state={state} />
      <div className="messages" ref={messagesContainerRef} onScroll={handleScroll}>
        {messages.map((msg, i) => {
          let fileData: { _file: true; transferId: string; files: { name: string; size: number }[]; totalSize: number } | null = null;
          try {
            const parsed = JSON.parse(msg.content);
            if (parsed._file) fileData = parsed;
          } catch { /* not JSON */ }

          const isMatch = !!searchLower;
          const isActiveMatch = isMatch && i === activeMatchIndex;
          const msgClass = `message${isMatch ? ' search-match' : ''}${isActiveMatch ? ' search-active' : ''}`;

          return (
            <div key={msg.id || i} className={msgClass}>
              <span className="time">[{formatTime(msg.ts)}]</span>
              <span className="from" style={{ color: agentColor(state.agents[msg.from]?.nick || msg.fromNick || msg.from) }}>
                &lt;{state.agents[msg.from]?.nick || msg.fromNick || msg.from}&gt;
              </span>
              <span className="agent-id">{msg.from}</span>
              {state.agents[msg.from]?.verified
                ? <span className="verified-badge">&#x2713;</span>
                : state.agents[msg.from] && <span className="unverified-badge">&#x26A0;</span>
              }
              {fileData ? (
                <span className="file-bubble">
                  <span className="file-icon">&#x1F4CE;</span>
                  <span className="file-bubble-info">
                    {fileData.files.map((f, fi) => (
                      <a
                        key={fi}
                        className="file-bubble-link"
                        href={`/api/download/${fileData!.transferId}/${fi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {f.name}
                      </a>
                    ))}
                    <span className="file-bubble-size">({formatSize(fileData.totalSize)})</span>
                  </span>
                </span>
              ) : (
                <MessageContent content={msg.content} searchQuery={searchLower} />
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      {!isAtBottom && (
        <button className="jump-to-bottom" onClick={jumpToBottom}>
          Jump to bottom
        </button>
      )}
      {typingInChannel.length > 0 && (
        <div className="typing-indicator">
          {typingInChannel.length === 1
            ? `${typingInChannel[0]} is typing...`
            : typingInChannel.length === 2
              ? `${typingInChannel[0]} and ${typingInChannel[1]} are typing...`
              : `${typingInChannel[0]} and ${typingInChannel.length - 1} others are typing...`}
        </div>
      )}
      <form className="input-bar" onSubmit={handleSend}>
        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend(e as unknown as FormEvent);
            }
          }}
          placeholder={state.mode === 'lurk' ? 'Lurk mode - read only' : 'Type a message...'}
          disabled={state.mode === 'lurk'}
          style={{ resize: 'vertical', minHeight: '36px', maxHeight: '200px' }}
        />
        <button type="submit" disabled={state.mode === 'lurk'}>Send</button>
      </form>
    </div>
  );
}
