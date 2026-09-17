import { TICK_MS } from "@/game/config/movement";

export const MAX_CATCH_UP_TICKS = 5;

export class FixedClock {
  private accumulator = 0;

  reset(): void {
    this.accumulator = 0;
  }

  advance(deltaMs: number, step: () => void, speed = 1): number {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return 0;
    this.accumulator += Math.min(deltaMs * speed, TICK_MS * MAX_CATCH_UP_TICKS);
    let count = 0;
    while (this.accumulator + 1e-7 >= TICK_MS && count < MAX_CATCH_UP_TICKS) {
      step();
      this.accumulator -= TICK_MS;
      count++;
    }
    this.accumulator = Math.max(0, this.accumulator);
    return count;
  }
}
