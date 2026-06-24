import { useState } from 'react';

export interface DebugError {
  id:      string;
  agent:   string;
  color:   string;
  message: string;
  at:      number;
}

interface Props {
  errors:   DebugError[];
  onClear:  () => void;
}

function timeLabel(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function shortMsg(msg: string): string {
  return msg.length > 120 ? msg.slice(0, 120) + '…' : msg;
}

export function DebugPanel({ errors, onClear }: Props) {
  const [open, setOpen] = useState(false);

  if (errors.length === 0) return null;

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col items-end gap-1" style={{ maxWidth: 440 }}>
      {/* Expanded panel */}
      {open && (
        <div className="w-full bg-gray-950 border border-gray-700 rounded-xl shadow-2xl overflow-hidden text-[11px] font-mono">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
            <span className="text-gray-300 font-semibold tracking-wide">Debug — {errors.length} error{errors.length !== 1 ? 's' : ''}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={onClear}
                className="text-gray-500 hover:text-gray-300 transition-colors text-[10px] uppercase tracking-wider"
              >
                Clear
              </button>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-500 hover:text-gray-300 transition-colors text-base leading-none"
              >
                ×
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-0 max-h-64 overflow-y-auto divide-y divide-gray-800">
            {[...errors].reverse().map(err => (
              <div key={err.id} className="flex flex-col gap-0.5 px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: err.color }} />
                  <span className="text-gray-400 font-bold">{err.agent}</span>
                  <span className="text-gray-600 ml-auto">{timeLabel(err.at)}</span>
                </div>
                <span className="text-red-400 leading-snug break-all">{shortMsg(err.message)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collapsed badge */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-950 border border-red-800 rounded-lg shadow-lg hover:border-red-600 transition-colors"
        >
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[11px] text-red-400 font-mono font-semibold">
            {errors.length} error{errors.length !== 1 ? 's' : ''}
          </span>
        </button>
      )}
    </div>
  );
}
