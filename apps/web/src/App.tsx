import { useEffect, useRef, useState, useCallback } from 'react';
import { World } from './engine/World';
import type { AgentStateSnapshot, PlayerState } from './engine/World';
import { SpritePanel }      from './components/SpritePanel';
import { SettingsPanel }    from './components/SettingsPanel';
import { SpawnPanel }       from './components/SpawnPanel';
import { AccessoriesPanel } from './components/AccessoriesPanel';
import { ChatBar }          from './components/ChatBar';
import { saveTileMap }      from './store/persistence';
import { loadSettings, saveSettings } from './store/settings';
import { loadWeapons }      from './store/weapons';
import type { WeaponDef }   from './store/weapons';

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
  const [playerState,  setPlayerState]  = useState<PlayerState>(DEFAULT_PLAYER_STATE);
  const [weapons,      setWeapons]      = useState<WeaponDef[]>(loadWeapons);

  const isPainting = useRef(false);
  const isErasing  = useRef(false);
  const lastCell   = useRef<{ cellX: number; cellY: number } | null>(null);

  const applyApiKey = useCallback((key: string) => {
    worldRef.current?.setApiKey(key);
    setHasApiKey(Boolean(key));
    saveSettings({ openrouterApiKey: key, openrouterModel: '' });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const world  = new World(canvas);
    worldRef.current = world;

    world.onAgentsChange     = (updated) => setAgents(updated);
    world.onPlayerStateChange = (state)  => setPlayerState(state);

    // Init weapon defs from persisted store.
    const storedWeapons = loadWeapons();
    world.setWeaponDefs(storedWeapons);
    setWeapons(storedWeapons);

    world.start();
    setWorldReady(true);
    setPlayerState(world.getPlayerState());

    // Restore API key.
    const saved = loadSettings();
    if (saved.openrouterApiKey) {
      world.setApiKey(saved.openrouterApiKey);
      setHasApiKey(true);
    }

    return () => {
      world.destroy();
      worldRef.current = null;
      setWorldReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    worldRef.current?.setPauseAI(isPaused);
  }, [isPaused]);

  // ── Tile painting ─────────────────────────────────────────────────────────

  const paintOrEraseAt = (clientX: number, clientY: number, tileIndex: number) => {
    const world = worldRef.current;
    if (!world) return;
    const { cellX, cellY } = world.screenToCell(clientX, clientY);
    if (lastCell.current?.cellX === cellX && lastCell.current?.cellY === cellY) return;
    lastCell.current = { cellX, cellY };
    if (isErasing.current) {
      world.eraseCell(cellX, cellY);
    } else {
      world.paintCell(cellX, cellY, tileIndex);
    }
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

  const canvasCursor = selectedTile === null
    ? 'default'
    : selectedTile === -1
      ? 'cell'
      : 'crosshair';

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#ffffff' }}>
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', imageRendering: 'pixelated', cursor: canvasCursor }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={finishStroke}
        onMouseLeave={finishStroke}
        onContextMenu={e => e.preventDefault()}
      />

      {/* Settings — gear icon top-left */}
      <SettingsPanel onApiKeyChange={applyApiKey} />

      {/* Accessories — shield icon next to gear */}
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
        isPaused={isPaused}
        hasApiKey={hasApiKey}
        onPauseToggle={() => setIsPaused(v => !v)}
      />

      {/* World editor panel — right side */}
      <SpritePanel
        worldRef={worldRef}
        worldReady={worldReady}
        selectedTile={selectedTile}
        onTileSelect={setSelectedTile}
        agents={agents}
      />

      {/* Player → agent chat bar — bottom center */}
      <ChatBar worldRef={worldRef} agents={agents} />
    </div>
  );
}
