const DIAGONAL = 1 / Math.SQRT2;

const PREVENTED_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
]);

export class Input {
  private keys = new Set<string>();
  private jumpQueued = false;

  attach() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  detach() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  getMovementVector(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp'))    y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown'))  y += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft'))  x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;

    // Normalise diagonal so speed is identical in all directions.
    if (x !== 0 && y !== 0) {
      x *= DIAGONAL;
      y *= DIAGONAL;
    }
    return { x, y };
  }

  isRunning(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  consumeJumpPress(): boolean {
    if (!this.jumpQueued) return false;
    this.jumpQueued = false;
    return true;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const isNew = !this.keys.has(e.code);
    this.keys.add(e.code);
    if (e.code === 'Space' && isNew) this.jumpQueued = true;
    if (PREVENTED_KEYS.has(e.code)) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
}
