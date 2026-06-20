export class Health {
  maxHP: number;
  currentHP: number;

  constructor(maxHP = 100) {
    this.maxHP = maxHP;
    this.currentHP = maxHP;
  }

  get isDead(): boolean { return this.currentHP <= 0; }

  get fraction(): number { return this.maxHP > 0 ? Math.max(0, this.currentHP / this.maxHP) : 0; }

  takeDamage(amount: number) {
    this.currentHP = Math.max(0, this.currentHP - amount);
  }

  heal(amount: number) {
    this.currentHP = Math.min(this.maxHP, this.currentHP + amount);
  }

  setMax(max: number) {
    const frac = this.fraction;
    this.maxHP = Math.max(1, max);
    this.currentHP = Math.round(this.maxHP * frac);
  }

  reset() {
    this.currentHP = this.maxHP;
  }
}
