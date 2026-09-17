import { DIRECTIVES, type DirectiveId } from "@/game/contracts/directives";
import type { ComparisonResult, HumanReplay } from "@/game/replay";
import type { SlotKind } from "@/game/sim/types";
import styles from "./ComparisonPanel.module.css";

interface Props {
  replay: HumanReplay | null;
  results: ComparisonResult[];
  canCapture: boolean;
  companion: SlotKind;
  onCapture: () => void;
  onRun: (directive: DirectiveId) => void;
}

export function ComparisonPanel({
  replay,
  results,
  canCapture,
  companion,
  onCapture,
  onRun,
}: Props) {
  const canRun =
    replay !== null && (companion === "JEV" || companion === "MOCK_AI");
  return (
    <section className={styles.panel} aria-label="Directive comparison">
      <h3>Directive comparison</h3>
      <p>
        Save your human inputs, then replay them with each priority. Every run
        uses the same seed and recorded inputs. Jev decisions and network timing
        can vary.
      </p>
      <button
        className="secondary-button"
        disabled={!canCapture}
        onClick={onCapture}
      >
        Save human replay
      </button>
      <p role="status">
        {replay
          ? `Seed ${replay.seed} · ${(replay.actions.length / 60).toFixed(1)} seconds recorded`
          : "Play as Human in slot 1 to record a comparison."}
      </p>
      {companion === "MOCK_AI" && (
        <p>
          Mock AI uses scripted priorities as an offline baseline. These results
          are not live Jev decisions.
        </p>
      )}
      <div className={styles.actions}>
        {Object.values(DIRECTIVES).map((directive) => (
          <button
            className="secondary-button"
            key={directive.id}
            disabled={!canRun}
            onClick={() => onRun(directive.id)}
          >
            Run {directive.label}
          </button>
        ))}
      </div>
      {results.length > 0 && (
        <div
          className={styles.table}
          tabIndex={0}
          role="region"
          aria-label="Comparison results"
        >
          <table>
            <caption>Measured outcomes for the saved human replay</caption>
            <thead>
              <tr>
                <th scope="col">Directive</th>
                <th scope="col">Controller</th>
                <th scope="col">Time</th>
                <th scope="col">Score</th>
                <th scope="col">Coins</th>
                <th scope="col">Kills</th>
                <th scope="col">Damage</th>
                <th scope="col">Jev progress</th>
                <th scope="col">Revives</th>
                <th scope="col">Distance</th>
                <th scope="col">Latency</th>
                <th scope="col">Fallback</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result, index) => (
                <tr key={index}>
                  <th scope="row">{DIRECTIVES[result.directive].label}</th>
                  <td>{result.companion === "JEV" ? "Jev" : "Mock"}</td>
                  <td>{(result.elapsedMs / 1000).toFixed(1)}s</td>
                  <td>{result.teamScore}</td>
                  <td>
                    {result.teamCoins} ({result.jevCoins} Jev)
                  </td>
                  <td>{result.teamKills}</td>
                  <td>{result.teamDamageTaken}</td>
                  <td>{Math.round(result.jevProgressPx)}px</td>
                  <td>{result.jevRevives}</td>
                  <td>{Math.round(result.averageTeammateDistancePx)}px</td>
                  <td>
                    {result.averageLatencyMs === null
                      ? "—"
                      : `${Math.round(result.averageLatencyMs)}ms`}
                  </td>
                  <td>{(result.fallbackTicks / 60).toFixed(1)}s</td>
                  <td>{result.status.replaceAll("_", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
