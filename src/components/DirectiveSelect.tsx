import { DIRECTIVES, DirectiveIdSchema, type DirectiveId } from "@/game/contracts/directives";
import styles from "./DirectiveSelect.module.css";

export function DirectiveSelect({
  directive,
  disabled,
  onChange,
}: {
  directive: DirectiveId;
  disabled: boolean;
  onChange: (directive: DirectiveId) => void;
}) {
  return (
    <label className={styles.control}>
      <span>JEV mode</span>
      <select
        value={directive}
        disabled={disabled}
        title={DIRECTIVES[directive].blurb}
        onChange={(event) => {
          const next = DirectiveIdSchema.safeParse(event.target.value);
          if (next.success) onChange(next.data);
        }}
      >
        {Object.values(DIRECTIVES).map(({ id, label }) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
