export class Camera {
  x = 0;
  y = 0;

  // Follow the target exactly so the character stays pinned at screen centre.
  // Smoothness comes from delta-time physics in Player, not camera lag.
  update(_dt: number, targetX: number, targetY: number) {
    this.x = targetX;
    this.y = targetY;
  }

  worldToScreen(wx: number, wy: number, cssW: number, cssH: number) {
    return {
      x: wx - this.x + cssW / 2,
      y: wy - this.y + cssH / 2,
    };
  }

  topLeft(cssW: number, cssH: number) {
    return {
      x: this.x - cssW / 2,
      y: this.y - cssH / 2,
    };
  }
}
