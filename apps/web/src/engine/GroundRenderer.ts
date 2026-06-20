import type { Camera } from './Camera';
import { CELL_SIZE, snapToDevicePixel } from './GridRenderer';
import type { TileMap } from './TileMap';
import type { GroundTileSheet } from './GroundTileSheet';

export class GroundRenderer {
  draw(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    tileSheet: GroundTileSheet | null,
    tileMap: TileMap,
    cssW: number,
    cssH: number,
    dpr: number,
  ) {
    if (!tileSheet || tileMap.size === 0) return;

    const tl = camera.topLeft(cssW, cssH);
    const startCellX = Math.floor(tl.x / CELL_SIZE);
    const startCellY = Math.floor(tl.y / CELL_SIZE);
    const endCellX   = Math.ceil((tl.x + cssW) / CELL_SIZE);
    const endCellY   = Math.ceil((tl.y + cssH) / CELL_SIZE);

    ctx.save();

    for (let cy = startCellY; cy <= endCellY; cy++) {
      for (let cx = startCellX; cx <= endCellX; cx++) {
        const tileIndex = tileMap.get(cx, cy);
        if (tileIndex === undefined) continue;

        const screenX = snapToDevicePixel(cx * CELL_SIZE - tl.x, dpr);
        const screenY = snapToDevicePixel(cy * CELL_SIZE - tl.y, dpr);

        tileSheet.drawTile(ctx, tileIndex, screenX, screenY, CELL_SIZE);
      }
    }

    ctx.restore();
  }
}
