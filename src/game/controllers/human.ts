import type { PlayerInputV1 } from "../contracts/input";
import type { ControllerContext, PlayerController } from "./types";

export interface KeyBindings {
  left: string[];
  right: string[];
  jump: string[];
  drop: string[];
  shoot: string[];
  dash: string[];
  interact: string[];
}

export const DEFAULT_BINDINGS: KeyBindings = {
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  jump: ["KeyW", "ArrowUp", "Space"],
  drop: ["KeyS", "ArrowDown"],
  shoot: ["KeyJ"],
  dash: ["KeyK", "ShiftLeft", "ShiftRight"],
  interact: ["KeyE"],
};

/**
 * Human keyboard/mouse controller. Emits the same PlayerInputV1 that JEV
 * emits; the simulation cannot tell them apart.
 */
export class HumanController implements PlayerController {
  readonly kind = "HUMAN" as const;
  private down = new Set<string>();
  private mouseDown = false;
  private bindings: KeyBindings;
  private target: EventTarget | null;

  constructor(
    target: EventTarget | null = typeof window !== "undefined" ? window : null,
    bindings: KeyBindings = DEFAULT_BINDINGS,
  ) {
    this.bindings = bindings;
    this.target = target;
    target?.addEventListener("keydown", this.onKeyDown);
    target?.addEventListener("keyup", this.onKeyUp);
    target?.addEventListener("mousedown", this.onMouseDown);
    target?.addEventListener("mouseup", this.onMouseUp);
    target?.addEventListener("blur", this.onBlur);
  }

  private onKeyDown = (e: Event): void => {
    const k = e as KeyboardEvent;
    this.down.add(k.code);
    if (k.code === "Space" || k.code.startsWith("Arrow")) k.preventDefault();
  };
  private onKeyUp = (e: Event): void => {
    this.down.delete((e as KeyboardEvent).code);
  };
  private onMouseDown = (e: Event): void => {
    if ((e as MouseEvent).button === 0) this.mouseDown = true;
  };
  private onMouseUp = (e: Event): void => {
    if ((e as MouseEvent).button === 0) this.mouseDown = false;
  };
  private onBlur = (): void => {
    this.down.clear();
    this.mouseDown = false;
  };

  /** For tests / virtual gamepads. */
  setKey(code: string, pressed: boolean): void {
    if (pressed) this.down.add(code);
    else this.down.delete(code);
  }

  private any(codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  update(ctx: ControllerContext): PlayerInputV1 {
    const left = this.any(this.bindings.left);
    const right = this.any(this.bindings.right);
    const jump = this.any(this.bindings.jump);
    const drop = this.any(this.bindings.drop);
    return {
      schemaVersion: "1.0",
      episodeId: ctx.episodeId,
      basedOnTick: ctx.tick,
      horizontal: left && !right ? "left" : right && !left ? "right" : "neutral",
      verticalAction: jump ? "jump" : drop ? "drop" : "none",
      shoot: this.any(this.bindings.shoot) || this.mouseDown,
      dash: this.any(this.bindings.dash),
      interact: this.any(this.bindings.interact),
      holdForMs: 100,
    };
  }

  dispose(): void {
    this.target?.removeEventListener("keydown", this.onKeyDown);
    this.target?.removeEventListener("keyup", this.onKeyUp);
    this.target?.removeEventListener("mousedown", this.onMouseDown);
    this.target?.removeEventListener("mouseup", this.onMouseUp);
    this.target?.removeEventListener("blur", this.onBlur);
  }
}
