import type { PlayerState, SlotKind } from "@/game/sim/types";
import styles from "./JevActions.module.css";

export function JevActions({
  player,
  slot,
}: {
  player: PlayerState;
  slot: SlotKind;
}) {
  const available = slot !== "DISABLED" && player.alive && !player.downed;
  const input = available ? player.lastInput : null;
  const actions = [
    {
      label: "Move",
      value:
        input?.horizontal === "left"
          ? "← Left"
          : input?.horizontal === "right"
            ? "Right →"
            : "None",
      active: !!input && input.horizontal !== "neutral",
    },
    {
      label: "Vertical",
      value:
        input?.verticalAction === "jump"
          ? "Jump held"
          : input?.verticalAction === "drop"
            ? "Drop"
            : "None",
      active: !!input && input.verticalAction !== "none",
    },
    {
      label: "Fire",
      value: input?.shoot ? "On" : "Off",
      active: !!input?.shoot,
    },
    { label: "Dash", value: input?.dash ? "On" : "Off", active: !!input?.dash },
    {
      label: "Interact",
      value: input?.interact ? "On" : "Off",
      active: !!input?.interact,
    },
  ];
  const state =
    slot === "DISABLED"
      ? "Disabled"
      : !player.alive
        ? "Dead"
        : player.downed
          ? "Downed"
          : !input
            ? "Waiting"
            : actions.some((action) => action.active)
              ? "Active"
              : "Idle";

  return (
    <section
      className={styles.panel}
      aria-label="JEV applied actions"
      aria-live="off"
    >
      <div className={styles.heading}>
        <span>Applied actions</span>
        <strong>{state}</strong>
      </div>
      <dl className={styles.actions}>
        {actions.map(({ label, value, active }) => (
          <div className={styles.action} data-active={active} key={label}>
            <dt>{label}</dt>
            <dd>{input ? value : "—"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
