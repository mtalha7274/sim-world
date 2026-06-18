import type { Input } from './Input';

export type MovementState = 'idle' | 'walk' | 'run';
export type AnimationState = MovementState | 'jump';
export type Facing = 'left' | 'right';

const WALK_SPEED = 160;
const RUN_SPEED  = 320;
const JUMP_DURATION = 0.45;
const JUMP_LIFT = 28;

export class Player {
  x = 0;
  y = 0;
  facing: Facing = 'right';

  private groundState: MovementState = 'idle';
  private jumping = false;
  private jumpElapsed = 0;

  update(dt: number, input: Input) {
    if (input.consumeJumpPress() && !this.jumping) {
      this.jumping = true;
      this.jumpElapsed = 0;
    }

    if (this.jumping) {
      this.jumpElapsed += dt;
      if (this.jumpElapsed >= JUMP_DURATION) {
        this.jumping = false;
        this.jumpElapsed = 0;
      }
    }

    const move = input.getMovementVector();
    const running = input.isRunning();
    const moving = move.x !== 0 || move.y !== 0;
    const speed = running ? RUN_SPEED : WALK_SPEED;

    this.x += move.x * speed * dt;
    this.y += move.y * speed * dt;

    if (moving) {
      this.groundState = running ? 'run' : 'walk';
      if (move.x < 0) this.facing = 'left';
      else if (move.x > 0) this.facing = 'right';
    } else if (!this.jumping) {
      this.groundState = 'idle';
    }
  }

  get animationState(): AnimationState {
    return this.jumping ? 'jump' : this.groundState;
  }

  get jumpLift(): number {
    if (!this.jumping) return 0;
    const t = this.jumpElapsed / JUMP_DURATION;
    return -JUMP_LIFT * 4 * t * (1 - t);
  }
}
