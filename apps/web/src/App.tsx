import { useEffect, useRef, useState, useCallback } from 'react';
import { World } from './engine/World';
import type { AgentStateSnapshot, PlayerState } from './engine/World';
import { SpritePanel }      from './components/SpritePanel';
import { SettingsPanel }    from './components/SettingsPanel';
import { SpawnPanel }       from './components/SpawnPanel';
import { AccessoriesPanel } from './components/AccessoriesPanel';
import { ChatBar }          from './components/ChatBar';
import { DebugPanel }       from './components/DebugPanel';
import type { DebugError }  from './components/DebugPanel';
import type { ChatMessage }  from './components/ChatPanel';
import { saveTileMap }      from './store/persistence';
import { loadSettings, saveSettings } from './store/settings';
import { loadWeapons }      from './store/weapons';
import { loadPresets }      from './store/spriteLibrary';
import type { WeaponDef }   from './store/weapons';
import type { SpritePreset } from './store/spriteLibrary';

const DEFAULT_PLAYER_STATE: PlayerState = {
  maxHP:           100,
  currentHP:       100,
  isDead:          false,
  equippedWeaponId: null,
};

export default function App() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const worldRef   = useRef<World | null>(null);
  const [worldReady, setWorldReady] = useState(false);

  const [selectedTile, setSelectedTile] = useState<number | null>(null);
  const [agents,       setAgents]       = useState<AgentStateSnapshot[]>([]);
  const [isPaused,     setIsPaused]     = useState(false);
  const [hasApiKey,    setHasApiKey]    = useState(false);
  const [defaultModel, setDefaultModel] = useState('');
  const [playerState,  setPlayerState]  = useState<PlayerState>(DEFAULT_PLAYER_STATE);
  const [weapons,      setWeapons]      = useState<WeaponDef[]>(loadWeapons);
  const [presets,      setPresets]      = useState<SpritePreset[]>(loadPresets);
  const [arenaRules,   setArenaRules]   = useState('');
  const [chatLog,      setChatLog]      = useState<ChatMessage[]>([]);
  const [debugErrors,  setDebugErrors]  = useState<DebugError[]>([]);
  let   _chatIdCounter  = useRef(0);
  let   _debugIdCounter = useRef(0);

  const isPainting = useRef(false);
  const isErasing  = useRef(false);
  const lastCell   = useRef<{ cellX: number; cellY: number } | null>(null);

  const applySettings = useCallback((key: string, model: string) => {
    worldRef.current?.setApiKey(key);
    setHasApiKey(Boolean(key));
    setDefaultModel(model);
    saveSettings({ openrouterApiKey: key, openrouterModel: model });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    // Give canvas a tabIndex so .focus() works.
    canvas.tabIndex = 0;
    canvas.style.outline = 'none';

    const world  = new World(canvas);
    worldRef.current = world;

    world.onAgentsChange      = (updated) => setAgents(updated);
    world.onPlayerStateChange = (state)  => setPlayerState(state);
    world.onAgentError = (name, color, message) => {
      setDebugErrors(prev => [...prev, {
        id:      `err-${++_debugIdCounter.current}`,
        agent: name, color, message, at: Date.now(),
      }]);
    };

    world.onChatMessage       = (from, color, isPlayer, text) => {
      setChatLog(prev => [...prev, {
        id:       `msg-${++_chatIdCounter.current}`,
        from, color, isPlayer, text, at: Date.now(),
      }]);
    };

    const storedWeapons = loadWeapons();
    world.setWeaponDefs(storedWeapons);
    setWeapons(storedWeapons);

    world.start();
    setWorldReady(true);
    setPlayerState(world.getPlayerState());

    const saved = loadSettings();
    if (saved.openrouterApiKey) {
      world.setApiKey(saved.openrouterApiKey);
      setHasApiKey(true);
    }
    if (saved.openrouterModel) setDefaultModel(saved.openrouterModel);

    return () => {
      world.destroy();
      worldRef.current = null;
      setWorldReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { worldRef.current?.setPauseAI(isPaused); }, [isPaused]);
  useEffect(() => { worldRef.current?.setArenaRules(arenaRules); }, [arenaRules]);

  // Refresh presets list when SpritePanel saves new ones.
  const refreshPresets = useCallback(() => setPresets(loadPresets()), []);

  // ── Tile painting ─────────────────────────────────────────────────────────

  const paintOrEraseAt = (clientX: number, clientY: number, tileIndex: number) => {
    const world = worldRef.current;
    if (!world) return;
    const { cellX, cellY } = world.screenToCell(clientX, clientY);
    if (lastCell.current?.cellX === cellX && lastCell.current?.cellY === cellY) return;
    lastCell.current = { cellX, cellY };
    if (isErasing.current) world.eraseCell(cellX, cellY);
    else                   world.paintCell(cellX, cellY, tileIndex);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (selectedTile === null) return;
    isPainting.current = true;
    isErasing.current  = e.button === 2 || selectedTile === -1;
    lastCell.current   = null;
    paintOrEraseAt(e.clientX, e.clientY, selectedTile);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPainting.current || selectedTile === null) return;
    paintOrEraseAt(e.clientX, e.clientY, selectedTile);
  };

  const finishStroke = () => {
    if (!isPainting.current) return;
    isPainting.current = false;
    lastCell.current   = null;
    const world = worldRef.current;
    if (world) saveTileMap(world.getTileMap());
  };

  const canvasCursor = selectedTile === null ? 'default' : selectedTile === -1 ? 'cell' : 'crosshair';

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#fff' }}>
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', imageRendering: 'pixelated', cursor: canvasCursor }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={finishStroke}
        onMouseLeave={finishStroke}
        onContextMenu={e => e.preventDefault()}
      />

      {/* ── Arena rules bar ─── fixed top-center ────────────────────────── */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-1.5 bg-white/90 border border-gray-200 rounded-b-lg shadow-sm backdrop-blur-sm"
        style={{ maxWidth: 520 }}
      >
        <span className="text-[10px] uppercase tracking-widest text-gray-400 shrink-0">Arena</span>
        <input
          type="text"
          value={arenaRules}
          onChange={e => setArenaRules(e.target.value)}
          placeholder='Rules / organiser instructions — e.g. "Last one standing wins"'
          className="flex-1 text-xs text-gray-700 bg-transparent border-none outline-none placeholder:text-gray-300"
        />
        {arenaRules && (
          <button onClick={() => setArenaRules('')} className="text-gray-300 hover:text-gray-500 text-sm leading-none shrink-0">×</button>
        )}
      </div>

      {/* Settings — gear icon top-left */}
      <SettingsPanel onSettingsChange={applySettings} />

      {/* Accessories — HP & weapon panel */}
      <AccessoriesPanel
        worldRef={worldRef}
        playerState={playerState}
        onWeaponsChange={setWeapons}
      />

      {/* Agent spawn panel — left side */}
      <SpawnPanel
        worldRef={worldRef}
        agents={agents}
        weapons={weapons}
        presets={presets}
        isPaused={isPaused}
        hasApiKey={hasApiKey}
        defaultModel={defaultModel}
        onPauseToggle={() => setIsPaused(v => !v)}
      />

      {/* World editor panel — right side */}
      <SpritePanel
        worldRef={worldRef}
        worldReady={worldReady}
        selectedTile={selectedTile}
        onTileSelect={setSelectedTile}
        agents={agents}
        onPresetsChange={refreshPresets}
      />

      {/* Player → agent chat bar — bottom center */}
      <ChatBar worldRef={worldRef} agents={agents} messages={chatLog} />

      {/* Debug error panel — bottom right */}
      <DebugPanel errors={debugErrors} onClear={() => setDebugErrors([])} />
    </div>
  );
}
