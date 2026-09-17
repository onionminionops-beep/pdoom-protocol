import { DEFAULT_BINDINGS, HumanController, type KeyBindings } from "@/game/controllers/human";
import { ACTIONS } from "./settings";

export class HumanInputBridge {
  private pressed = new Set<string>();
  private enabled = true;
  private mousePressed = false;

  constructor(
    private controller: HumanController,
    private bindings: KeyBindings,
    private target: Window = window,
  ) {
    controller.dispose();
    target.addEventListener("keydown", this.keyDown);
    target.addEventListener("keyup", this.keyUp);
    target.addEventListener("blur", this.clear);
    target.addEventListener("mousedown", this.mouseDown);
    target.addEventListener("mouseup", this.mouseUp);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.clear();
  }

  setBindings(bindings: KeyBindings): void {
    this.bindings = bindings;
    this.clear();
  }

  private synchronize(): void {
    for (const action of ACTIONS) {
      this.controller.setKey(DEFAULT_BINDINGS[action][0], (action === "shoot" && this.mousePressed) || this.bindings[action].some((key) => this.pressed.has(key)));
    }
  }

  private keyDown = (event: KeyboardEvent): void => {
    if (!this.enabled || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target instanceof Element && event.target.closest("input,select,textarea,button,a,[contenteditable=true]")) return;
    if (!ACTIONS.some((action) => this.bindings[action].includes(event.code))) return;
    event.preventDefault();
    this.pressed.add(event.code);
    this.synchronize();
  };

  private keyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
    this.synchronize();
  };

  private mouseDown = (event: MouseEvent): void => {
    if (!this.enabled || event.button !== 0 || !(event.target instanceof HTMLCanvasElement)) return;
    this.mousePressed = true;
    this.synchronize();
  };

  private mouseUp = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    this.mousePressed = false;
    this.synchronize();
  };

  clear = (): void => {
    this.mousePressed = false;
    this.pressed.clear();
    this.synchronize();
  };

  dispose(): void {
    this.clear();
    this.target.removeEventListener("keydown", this.keyDown);
    this.target.removeEventListener("keyup", this.keyUp);
    this.target.removeEventListener("blur", this.clear);
    this.target.removeEventListener("mousedown", this.mouseDown);
    this.target.removeEventListener("mouseup", this.mouseUp);
  }
}
