import { useState, useCallback, type RefObject } from 'react';
import { loadWeapons, saveWeapons, newWeaponId, type WeaponDef } from '../store/weapons';
import type { World, PlayerState } from '../engine/World';

interface Props {
  worldRef:     RefObject<World | null>;
  playerState:  PlayerState;
  onWeaponsChange: (defs: WeaponDef[]) => void;
}

export function AccessoriesPanel({ worldRef, playerState, onWeaponsChange }: Props) {
  const [open,    setOpen]    = useState(false);
  const [weapons, setWeapons] = useState<WeaponDef[]>(loadWeapons);

  const [editing, setEditing] = useState<WeaponDef | null>(null);

  const commitWeapons = useCallback((updated: WeaponDef[]) => {
    saveWeapons(updated);
    setWeapons(updated);
    worldRef.current?.setWeaponDefs(updated);
    onWeaponsChange(updated);
  }, [worldRef, onWeaponsChange]);

  const handleAddWeapon = () => {
    const w: WeaponDef = { id: newWeaponId(), name: 'New Weapon', damage: 10, rangeInCells: 1, description: '' };
    const updated = [...weapons, w];
    commitWeapons(updated);
    setEditing(w);
  };

  const handleDeleteWeapon = (id: string) => {
    commitWeapons(weapons.filter(w => w.id !== id));
    if (editing?.id === id) setEditing(null);
    // Unequip player if they had this weapon.
    if (playerState.equippedWeaponId === id) {
      worldRef.current?.setPlayerWeapon(null);
    }
  };

  const handleSaveEdit = () => {
    if (!editing) return;
    commitWeapons(weapons.map(w => w.id === editing.id ? editing : w));
    setEditing(null);
  };

  return (
    <>
      {/* Shield/sword button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Accessories"
        className="
          fixed top-3 left-12 z-50
          w-8 h-8 bg-white border border-gray-200 rounded-md
          flex items-center justify-center
          text-gray-400 hover:text-gray-600 hover:border-gray-300
          shadow-sm transition-all
        "
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14.5 10c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5z"/>
          <path d="M20.5 10H19V8.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
          <path d="M9.5 14c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5S8 21.33 8 20.5v-5c0-.83.67-1.5 1.5-1.5z"/>
          <path d="M3.5 14H5v1.5c0 .83-.67 1.5-1.5 1.5S2 16.33 2 15.5 2.67 14 3.5 14z"/>
          <path d="M14 14l-4 4"/>
          <path d="M14 14l2-2"/>
          <path d="M10 10l2-2"/>
        </svg>
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.25)' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 w-[420px] max-h-[80vh] flex flex-col overflow-hidden">

            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">Accessories</span>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-6">

              {/* Player section */}
              <div className="flex flex-col gap-3">
                <span className="text-[10px] uppercase tracking-widest text-gray-400">Player</span>

                {/* Health */}
                <label className="flex items-center gap-3 text-xs text-gray-600">
                  <span className="w-20 shrink-0">Max HP</span>
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    value={playerState.maxHP}
                    onChange={e => worldRef.current?.setPlayerMaxHP(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20 px-2 py-1 border border-gray-200 rounded text-right text-xs focus:outline-none focus:border-gray-400"
                  />
                  <span className="text-gray-400">{playerState.currentHP} / {playerState.maxHP} HP</span>
                </label>

                {/* Weapon slot */}
                <label className="flex items-center gap-3 text-xs text-gray-600">
                  <span className="w-20 shrink-0">Weapon</span>
                  <select
                    value={playerState.equippedWeaponId ?? ''}
                    onChange={e => worldRef.current?.setPlayerWeapon(e.target.value || null)}
                    className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:border-gray-400 bg-white"
                  >
                    <option value="">None (fist — 5 dmg)</option>
                    {weapons.map(w => (
                      <option key={w.id} value={w.id}>{w.name} ({w.damage} dmg, {w.rangeInCells}c range)</option>
                    ))}
                  </select>
                </label>

                {/* Respawn */}
                {playerState.isDead && (
                  <button
                    onClick={() => worldRef.current?.respawnPlayer()}
                    className="self-start px-4 py-1.5 text-xs font-semibold rounded-md bg-gray-900 text-white hover:bg-gray-700 transition-colors"
                  >
                    Respawn Player
                  </button>
                )}
                {playerState.isDead && (
                  <p className="text-xs text-red-500">Player is dead.</p>
                )}
              </div>

              {/* Weapon definitions */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-widest text-gray-400">Weapon Definitions</span>
                  <button
                    onClick={handleAddWeapon}
                    className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-0.5 transition-colors"
                  >
                    + Add
                  </button>
                </div>

                {weapons.map(w => (
                  <div key={w.id} className="border border-gray-100 rounded-lg overflow-hidden">
                    <div
                      className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => setEditing(editing?.id === w.id ? null : { ...w })}
                    >
                      <span className="text-xs text-gray-700 flex-1">{w.name}</span>
                      <span className="text-[10px] text-gray-400">{w.damage} dmg · {w.rangeInCells}c</span>
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteWeapon(w.id); }}
                        className="text-gray-300 hover:text-red-400 text-sm leading-none ml-1 transition-colors"
                      >✕</button>
                    </div>

                    {editing?.id === w.id && (
                      <div className="px-3 pb-3 border-t border-gray-100 bg-gray-50 flex flex-col gap-2 pt-2">
                        {([
                          ['Name',        'name',         'text',   null,  null],
                          ['Description', 'description',  'text',   null,  null],
                          ['Damage',      'damage',       'number', 1,     9999],
                          ['Range (cells)','rangeInCells','number', 1,     10],
                        ] as [string, keyof WeaponDef, string, number | null, number | null][]).map(([label, field, type, min, max]) => (
                          <label key={field} className="flex items-center gap-2 text-xs text-gray-600">
                            <span className="w-24 shrink-0">{label}</span>
                            <input
                              type={type}
                              min={min ?? undefined}
                              max={max ?? undefined}
                              value={String(editing[field])}
                              onChange={e => {
                                const val = type === 'number' ? (parseInt(e.target.value) || 1) : e.target.value;
                                setEditing(prev => prev ? { ...prev, [field]: val } : null);
                              }}
                              className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:border-gray-400 bg-white"
                            />
                          </label>
                        ))}
                        <button
                          onClick={handleSaveEdit}
                          className="self-end px-3 py-1 text-xs font-semibold rounded bg-gray-900 text-white hover:bg-gray-700 transition-colors"
                        >
                          Save
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {weapons.length === 0 && (
                  <p className="text-[11px] text-gray-400">No weapons defined. Click + Add to create one.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
