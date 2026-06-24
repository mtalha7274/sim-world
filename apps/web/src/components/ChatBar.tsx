import { useState, useRef, type RefObject } from 'react';
import type { World, AgentStateSnapshot } from '../engine/World';
import { ChatPanel, type ChatMessage } from './ChatPanel';

interface Props {
  worldRef:  RefObject<World | null>;
  agents:    AgentStateSnapshot[];
  messages:  ChatMessage[];
}

export function ChatBar({ worldRef, agents, messages }: Props) {
  const [text,     setText]     = useState('');
  const [targetId, setTargetId] = useState<string>('all');
  const [panelOpen, setPanelOpen] = useState(false);
  const [lastSeen,  setLastSeen]  = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const unread = messages.length - lastSeen;

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || !worldRef.current) return;
    worldRef.current.broadcastPlayerMessage(trimmed, targetId === 'all' ? undefined : targetId);
    setText('');
    inputRef.current?.blur();
    document.querySelector('canvas')?.focus();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSend();
  };

  const togglePanel = () => {
    setPanelOpen(v => {
      if (!v) setLastSeen(messages.length); // mark all read on open
      return !v;
    });
  };

  return (
    <>
      {panelOpen && (
        <ChatPanel
          messages={messages}
          unread={unread}
          onClose={() => { setPanelOpen(false); setLastSeen(messages.length); }}
        />
      )}

      <div
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2"
        style={{ width: 540, maxWidth: 'calc(100vw - 32px)' }}
      >
        {/* Chat history toggle */}
        <button
          onClick={togglePanel}
          className={`relative shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium shadow-sm transition-all ${panelOpen ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          Chat
          {!panelOpen && unread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 text-[9px] font-bold bg-indigo-500 text-white rounded-full flex items-center justify-center leading-none">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>

        {/* Target selector */}
        <select
          value={targetId}
          onChange={e => setTargetId(e.target.value)}
          className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-gray-400 shrink-0 shadow-sm"
        >
          <option value="all">All nearby</option>
          {agents.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Say something to agents…"
          className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-gray-400 shadow-sm"
        />

        {/* Send */}
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors disabled:opacity-40 shadow-sm shrink-0"
        >
          Send
        </button>
      </div>
    </>
  );
}
