import { useEffect, useRef } from 'react';

export interface ChatMessage {
  id: string;
  from: string;
  color: string;
  isPlayer: boolean;
  text: string;
  at: number;
}

interface Props {
  messages: ChatMessage[];
  onClose: () => void;
  unread: number;
}

function timeLabel(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function ChatPanel({ messages, onClose, unread }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex flex-col"
      style={{ width: 520, maxWidth: 'calc(100vw - 32px)', maxHeight: '50vh' }}
    >
      <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">Chat</span>
            {unread > 0 && (
              <span className="text-[10px] font-bold bg-indigo-500 text-white rounded-full px-1.5 py-0.5 leading-none">{unread}</span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none">×</button>
        </div>

        {/* Message list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2 min-h-0" style={{ maxHeight: 'calc(50vh - 44px)' }}>
          {messages.length === 0 ? (
            <p className="text-[11px] text-gray-400 text-center py-6">No messages yet. Say something to agents using the bar below.</p>
          ) : (
            messages.map(msg => (
              <div key={msg.id} className={`flex gap-2 ${msg.isPlayer ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Avatar dot */}
                <div className="shrink-0 w-5 h-5 rounded-full mt-0.5 flex items-center justify-center" style={{ background: msg.color }}>
                  <span className="text-[8px] text-white font-bold">{msg.from[0].toUpperCase()}</span>
                </div>

                {/* Bubble */}
                <div className={`flex flex-col gap-0.5 max-w-[75%] ${msg.isPlayer ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-baseline gap-1.5">
                    {!msg.isPlayer && <span className="text-[10px] font-semibold text-gray-600">{msg.from}</span>}
                    <span className="text-[10px] text-gray-400">{timeLabel(msg.at)}</span>
                    {msg.isPlayer && <span className="text-[10px] font-semibold text-indigo-600">{msg.from}</span>}
                  </div>
                  <div
                    className={`px-3 py-1.5 rounded-2xl text-xs leading-relaxed ${
                      msg.isPlayer
                        ? 'bg-indigo-500 text-white rounded-tr-sm'
                        : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
