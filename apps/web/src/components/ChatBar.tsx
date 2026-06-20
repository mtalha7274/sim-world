import { useState, useRef, type RefObject } from 'react';
import type { World, AgentStateSnapshot } from '../engine/World';

interface Props {
  worldRef: RefObject<World | null>;
  agents:   AgentStateSnapshot[];
}

export function ChatBar({ worldRef, agents }: Props) {
  const [text,     setText]     = useState('');
  const [targetId, setTargetId] = useState<string>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || !worldRef.current) return;
    worldRef.current.broadcastPlayerMessage(trimmed, targetId === 'all' ? undefined : targetId);
    setText('');
    inputRef.current?.focus();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSend();
  };

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2"
      style={{ width: 480, maxWidth: 'calc(100vw - 32px)' }}
    >
      {/* Target selector */}
      <select
        value={targetId}
        onChange={e => setTargetId(e.target.value)}
        className="
          px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white
          focus:outline-none focus:border-gray-400 shrink-0 shadow-sm
        "
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
        className="
          flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white
          focus:outline-none focus:border-gray-400 shadow-sm
        "
      />

      {/* Send button */}
      <button
        onClick={handleSend}
        disabled={!text.trim()}
        className="
          px-3 py-1.5 text-xs font-semibold rounded-lg
          bg-gray-900 text-white hover:bg-gray-700
          transition-colors disabled:opacity-40 shadow-sm shrink-0
        "
      >
        Send
      </button>
    </div>
  );
}
