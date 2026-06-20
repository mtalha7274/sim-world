import { useState, useCallback } from 'react';
import { loadSettings, saveSettings } from '../store/settings';

interface Props {
  onApiKeyChange: (apiKey: string) => void;
}

export function SettingsPanel({ onApiKeyChange }: Props) {
  const [open,   setOpen]   = useState(false);
  const [apiKey, setApiKey] = useState(() => loadSettings().openrouterApiKey);
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [testError,  setTestError]  = useState('');

  const handleSave = useCallback(() => {
    saveSettings({ openrouterApiKey: apiKey, openrouterModel: '' });
    onApiKeyChange(apiKey);
    setOpen(false);
  }, [apiKey, onApiKeyChange]);

  const handleTest = useCallback(async () => {
    if (!apiKey) {
      setTestStatus('error');
      setTestError('Enter an API key first.');
      return;
    }
    setTestStatus('loading');
    setTestError('');
    try {
      const { testConnection } = await import('../llm/OpenRouterProvider');
      await testConnection(apiKey, 'openai/gpt-4o-mini');
      setTestStatus('ok');
    } catch (e) {
      setTestStatus('error');
      setTestError(e instanceof Error ? e.message : String(e));
    }
  }, [apiKey]);

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="Settings"
        className="
          fixed top-3 left-3 z-50
          w-8 h-8 bg-white border border-gray-200 rounded-md
          flex items-center justify-center
          text-gray-400 hover:text-gray-600 hover:border-gray-300
          shadow-sm transition-all
        "
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.25)' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-[360px] flex flex-col overflow-hidden">

            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">Settings</span>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none">×</button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-600">OpenRouter API key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => { setApiKey(e.target.value); setTestStatus('idle'); }}
                  placeholder="sk-or-…"
                  className="px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:border-gray-400 bg-white"
                />
                <p className="text-[10px] text-gray-400">
                  Each agent picks its own model at spawn time.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <button
                  onClick={handleTest}
                  disabled={testStatus === 'loading'}
                  className="py-1.5 text-xs border border-gray-200 rounded-md text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-colors disabled:opacity-50"
                >
                  {testStatus === 'loading' ? 'Testing…' : 'Test connection'}
                </button>
                {testStatus === 'ok'    && <p className="text-[11px] text-green-600 text-center">Connection successful</p>}
                {testStatus === 'error' && <p className="text-[11px] text-red-500 text-center leading-snug">{testError || 'Connection failed'}</p>}
              </div>

              <p className="text-[10px] text-gray-400 leading-relaxed bg-gray-50 rounded-md px-3 py-2">
                The API key is stored only in this browser's local storage and sent directly to OpenRouter. Do not deploy this app publicly with a key embedded.
              </p>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="px-4 py-1.5 text-xs border border-gray-200 rounded-md text-gray-500 hover:border-gray-300 transition-colors">Cancel</button>
              <button onClick={handleSave} className="px-4 py-1.5 text-xs font-semibold rounded-md bg-gray-900 text-white hover:bg-gray-700 transition-colors">Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
