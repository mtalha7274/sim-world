const MAX_DELTA = 0.1; // cap at 100ms to avoid spiral-of-death after tab switch

export class Loop {
  private raf = 0;
  private lastTime = 0;
  private running = false;

  constructor(
    private readonly onUpdate: (dt: number) => void,
    private readonly onRender: () => void,
  ) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.handleVisibility);
  }

  private handleVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(this.raf);
    } else {
      // Reset lastTime so the hidden interval doesn't arrive as one huge dt spike.
      this.lastTime = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  };

  private tick = (timestamp: number) => {
    const dt = Math.min((timestamp - this.lastTime) / 1000, MAX_DELTA);
    this.lastTime = timestamp;

    this.onUpdate(dt);
    this.onRender();

    this.raf = requestAnimationFrame(this.tick);
  };
}
