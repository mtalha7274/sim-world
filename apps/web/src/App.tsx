import { useEffect, useRef, useState } from 'react';
import { World } from './engine/World';
import { SpritePanel } from './components/SpritePanel';

export default function App() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const worldRef   = useRef<World | null>(null);
  const [worldReady, setWorldReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const world  = new World(canvas);
    worldRef.current = world;
    world.start();
    setWorldReady(true);

    return () => {
      world.destroy();
      worldRef.current = null;
      setWorldReady(false);
    };
  }, []);

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: '#ffffff',
      }}
    >
      {/* Canvas fills the full viewport; the panel overlays it. */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          imageRendering: 'pixelated',
        }}
      />

      {/* React only renders the side panel — never drives the game loop. */}
      <SpritePanel worldRef={worldRef} worldReady={worldReady} />
    </div>
  );
}
