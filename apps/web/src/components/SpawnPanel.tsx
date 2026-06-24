import { useState, type RefObject } from 'react';
import type { World, AgentStateSnapshot } from '../engine/World';
import type { WeaponDef } from '../store/weapons';
import { loadSettings } from '../store/settings';
import { loadPresets, hydratePreset, type SpritePreset } from '../store/spriteLibrary';

const AGENT_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
  '#9b59b6', '#1abc9c', '#e67e22', '#e91e63',
];
let colorIndex = 0;
const nextColor = () => AGENT_COLORS[colorIndex++ % AGENT_COLORS.length];

const STATE_LABEL: Record<string, string> = {
  idle:     'Idle',
  thinking: 'Thinking…',
  acting:   'Acting',
};

interface Props {
  worldRef:      RefObject<World | null>;
  agents:        AgentStateSnapshot[];
  weapons:       WeaponDef[];
  presets:       SpritePreset[];
  isPaused:      boolean;
  hasApiKey:     boolean;
  defaultModel:  string;
  onPauseToggle: () => void;
}

export function SpawnPanel({ worldRef, agents, weapons, presets, isPaused, hasApiKey, defaultModel, onPauseToggle }: Props) {
  const saved = loadSettings();
  const [open,        setOpen]        = useState(true);
  const [name,        setName]        = useState('');
  const [personality, setPersonality] = useState('');
  const [model,       setModel]       = useState(defaultModel || saved.openrouterModel || '');
  const [weaponId,    setWeaponId]    = useState('');
  const [maxHP,       setMaxHP]       = useState(100);
  const [presetId,    setPresetId]    = useState('');
  const [inspecting,  setInspecting]  = useState<string | null>(null);

  // Update model field when parent changes defaultModel.
  const effectiveModel = model || defaultModel;

  const [editHP,     setEditHP]     = useState<Record<string, number>>({});
  const [editWeapon, setEditWeapon] = useState<Record<string, string>>({});
  const [editModel,  setEditModel]  = useState<Record<string, string>>({});

  const handleSpawn = async () => {
    const world = worldRef.current;
    if (!world || !name.trim()) return;
    const id = world.spawnAgent({
      name:            name.trim(),
      personality:     personality.trim() || 'A curious wanderer.',
      model:           effectiveModel,
      color:           nextColor(),
      maxHP,
      equippedWeaponId: weaponId || null,
    });
    setName('');
    setPersonality('');

    // Apply selected preset to the newly spawned agent.
    if (presetId) {
      const preset = presets.find(p => p.id === presetId);
      if (preset) {
        const zones = await hydratePreset(preset);
        for (const [s, z] of Object.entries(zones) as [import('../store/spriteLibrary').AnimationState, import('../store/spriteLibrary').HydratedZone][]) {
          world.setCharacterAnimation(id, s, z as Parameters<typeof world.setCharacterAnimation>[2]);
        }
      }
    }
  };

  const handleRemove = (id: string) => {
    worldRef.current?.removeAgent(id);
    if (inspecting === id) setInspecting(null);
  };

  const applyAgentHP = (id: string) => {
    const val = editHP[id];
    if (val !== undefined) worldRef.current?.updateAgentHP(id, val);
  };

  const applyAgentWeapon = (id: string, wid: string) => {
    setEditWeapon(p => ({ ...p, [id]: wid }));
    worldRef.current?.updateAgentWeapon(id, wid || null);
  };

  const applyAgentModel = (id: string) => {
    const m = editModel[id];
    if (m !== undefined) worldRef.current?.updateAgentModel(id, m);
  };

  const PANEL_W = 296;

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed top-1/2 -translate-y-1/2 z-50 flex items-center justify-center w-5 h-14 bg-white border border-gray-200 rounded-r-md text-gray-400 hover:text-gray-600 hover:border-gray-300 shadow-sm transition-all duration-200"
        style={{ left: open ? PANEL_W : 0 }}
        title={open ? 'Close agent panel' : 'Open agent panel'}
      >
        <span style={{ fontSize: 10, lineHeight: 1 }}>{open ? '‹' : '›'}</span>
      </button>

      <div
        className={`fixed top-0 left-0 h-full bg-white border-r border-gray-200 flex flex-col z-40 transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ width: PANEL_W }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
          <span className="text-sm font-semibold text-gray-700">AI Agents</span>
          <button
            onClick={onPauseToggle}
            className={`text-xs px-2 py-1 rounded border transition-colors ${isPaused ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
          >
            {isPaused ? '▶ Resume AI' : '⏸ Pause AI'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">

          {!hasApiKey && (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-700 leading-snug">
              No API key set. Open Settings (⚙) to configure OpenRouter.
            </div>
          )}

          {/* Spawn form */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] uppercase tracking-widest text-gray-400">Spawn agent</span>

            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Name" maxLength={32} className="px-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-gray-400" />
            <textarea value={personality} onChange={e => setPersonality(e.target.value)} placeholder="Personality / instructions" rows={2} className="px-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-gray-400 resize-none" />

            {/* Model with default indicator */}
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  placeholder={defaultModel || 'Model (e.g. google/gemini-flash-1.5)'}
                  className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-gray-400"
                />
                {defaultModel && model !== defaultModel && (
                  <button onClick={() => setModel(defaultModel)} className="text-[10px] text-gray-400 hover:text-gray-600 shrink-0 whitespace-nowrap">↺ Default</button>
                )}
              </div>
              {defaultModel && !model && (
                <p className="text-[10px] text-gray-400">Using default: {defaultModel}</p>
              )}
            </div>

            <div className="flex gap-2">
              <label className="flex-1 flex flex-col gap-1">
                <span className="text-[10px] text-gray-400">Max HP</span>
                <input type="number" min={1} value={maxHP} onChange={e => setMaxHP(Math.max(1, parseInt(e.target.value) || 1))} className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-gray-400" />
              </label>
              <label className="flex-1 flex flex-col gap-1">
                <span className="text-[10px] text-gray-400">Weapon</span>
                <select value={weaponId} onChange={e => setWeaponId(e.target.value)} className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-gray-400 bg-white">
                  <option value="">None</option>
                  {weapons.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </label>
            </div>

            {/* Preset selector */}
            {presets.length > 0 && (
              <label className="flex flex-col gap-1">
                <span className="text-[10px] text-gray-400">Sprite preset</span>
                <select value={presetId} onChange={e => setPresetId(e.target.value)} className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-gray-400 bg-white">
                  <option value="">None (placeholder)</option>
                  {presets.map(p => <option key={p.id} value={p.id}>{p.name} ({Object.keys(p.zones).length} states)</option>)}
                </select>
              </label>
            )}

            <button onClick={handleSpawn} disabled={!name.trim()} className="py-1.5 text-xs font-semibold rounded-md bg-gray-900 text-white hover:bg-gray-700 transition-colors disabled:opacity-40">
              Spawn
            </button>
          </div>

          {/* Agent list */}
          {agents.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] uppercase tracking-widest text-gray-400">Active — {agents.length}</span>

              {agents.map(a => {
                const hpFrac = a.health.maxHP > 0 ? Math.max(0, a.health.currentHP / a.health.maxHP) : 0;
                const hpVal  = editHP[a.id]     ?? a.health.maxHP;
                const wepVal = editWeapon[a.id]  ?? (a.equippedWeaponId ?? '');
                const modVal = editModel[a.id]   ?? a.model;
                return (
                  <div key={a.id} className="flex flex-col rounded-lg border border-gray-100 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setInspecting(v => v === a.id ? null : a.id)}>
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: a.color }} />
                      <span className="text-xs text-gray-700 flex-1 truncate">{a.name}</span>

                      <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden shrink-0">
                        <div className="h-full rounded-full transition-all" style={{ width: `${hpFrac * 100}%`, background: hpFrac > 0.5 ? '#4caf50' : hpFrac > 0.25 ? '#ff9800' : '#f44336' }} />
                      </div>

                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ${a.lifecycleState === 'thinking' ? 'bg-blue-50 border-blue-200 text-blue-600' : a.lifecycleState === 'acting' ? 'bg-green-50 border-green-200 text-green-600' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                        {a.lifecycleState === 'acting' && a.actionName ? a.actionName : STATE_LABEL[a.lifecycleState]}
                      </span>

                      <button onClick={e => { e.stopPropagation(); handleRemove(a.id); }} className="text-gray-300 hover:text-red-400 transition-colors text-sm leading-none ml-1">✕</button>
                    </div>

                    {inspecting === a.id && (
                      <div className="px-3 pb-3 pt-2 border-t border-gray-100 bg-gray-50 flex flex-col gap-3">
                        <div className="flex flex-col gap-2">
                          <span className="text-[10px] uppercase tracking-widest text-gray-400">Equipment</span>

                          <div className="flex gap-1">
                            <input type="text" value={modVal} onChange={e => setEditModel(p => ({ ...p, [a.id]: e.target.value }))} placeholder="Model" className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-gray-400 bg-white" />
                            <button onClick={() => applyAgentModel(a.id)} className="px-2 py-1 text-xs border border-gray-200 rounded hover:border-gray-400 transition-colors text-gray-500">Set</button>
                          </div>

                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-gray-500 w-14 shrink-0">Max HP</span>
                            <input type="number" min={1} value={hpVal} onChange={e => setEditHP(p => ({ ...p, [a.id]: Math.max(1, parseInt(e.target.value) || 1) }))} className="w-16 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-gray-400 bg-white text-right" />
                            <span className="text-[10px] text-gray-400 flex-1">{a.health.currentHP}/{a.health.maxHP}</span>
                            <button onClick={() => applyAgentHP(a.id)} className="px-2 py-1 text-xs border border-gray-200 rounded hover:border-gray-400 transition-colors text-gray-500">Set</button>
                          </div>

                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-gray-500 w-14 shrink-0">Weapon</span>
                            <select value={wepVal} onChange={e => applyAgentWeapon(a.id, e.target.value)} className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-gray-400 bg-white">
                              <option value="">None</option>
                              {weapons.map(w => <option key={w.id} value={w.id}>{w.name} ({w.damage}dmg)</option>)}
                            </select>
                          </div>
                        </div>

                        {a.experience.length > 0 && (
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase tracking-widest text-gray-400">Experience ({a.experience.length} ep.)</span>
                            <div className="flex flex-col gap-0.5 max-h-20 overflow-y-auto">
                              {[...a.experience].reverse().map((e, i) => <span key={i} className="text-[10px] text-gray-500 leading-snug italic">{e}</span>)}
                            </div>
                          </div>
                        )}

                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase tracking-widest text-gray-400">Working memory</span>
                          <div className="flex flex-col gap-0.5 max-h-28 overflow-y-auto">
                            {a.memory.length === 0
                              ? <span className="text-[11px] text-gray-400">Empty</span>
                              : [...a.memory].reverse().map((m, i) => <span key={i} className="text-[11px] text-gray-600 leading-snug">{m}</span>)
                            }
                          </div>
                        </div>

                        {a.lastDecision && (
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] uppercase tracking-widest text-gray-400">Last decision</span>
                            <pre className="text-[10px] text-gray-500 bg-white border border-gray-100 rounded p-2 overflow-x-auto leading-snug">
                              {JSON.stringify(a.lastDecision, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {agents.length === 0 && (
            <p className="text-[11px] text-gray-400 text-center pt-2">No agents yet. Fill in the form above and click Spawn.</p>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-100 shrink-0">
          <p className="text-[11px] text-gray-400 leading-relaxed">
            <strong className="text-gray-500">E</strong> attack nearest · <strong className="text-gray-500">WASD</strong> move · <strong className="text-gray-500">Shift</strong> run
          </p>
        </div>
      </div>
    </>
  );
}
