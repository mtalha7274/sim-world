export const TILE_COLS = 3;
export const TILE_ROWS = 3;

export class TileMap {
  private tiles = new Map<string, number>();

  static key(cellX: number, cellY: number): string {
    return `${cellX},${cellY}`;
  }

  set(cellX: number, cellY: number, tileIndex: number) {
    this.tiles.set(TileMap.key(cellX, cellY), tileIndex);
  }

  get(cellX: number, cellY: number): number | undefined {
    return this.tiles.get(TileMap.key(cellX, cellY));
  }

  delete(cellX: number, cellY: number) {
    this.tiles.delete(TileMap.key(cellX, cellY));
  }

  get size(): number {
    return this.tiles.size;
  }

  toRecord(): Record<string, number> {
    return Object.fromEntries(this.tiles);
  }

  loadRecord(data: Record<string, number>) {
    this.tiles.clear();
    for (const [k, v] of Object.entries(data)) {
      this.tiles.set(k, v);
    }
  }

  clear() {
    this.tiles.clear();
  }
}
