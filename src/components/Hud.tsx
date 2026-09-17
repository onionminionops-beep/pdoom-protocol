import { MOVEMENT } from "@/game/config/movement";
import { WEAPONS } from "@/game/config/weapons";
import type { DirectiveId } from "@/game/contracts/directives";
import { keyLabel, type ClientSettings } from "@/game/client/settings";
import type { ClientSnapshot } from "@/game/client/session";
import { CharacterMark } from "./CharacterMark";
import { JevActions } from "./JevActions";
import { DirectiveSelect } from "./DirectiveSelect";

export function elapsedLabel(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function Hud({ snapshot, settings, onPause, onQuit, onDirectiveChange }: { snapshot: ClientSnapshot; settings: ClientSettings; onPause: () => void; onQuit: () => void; onDirectiveChange: (directive: DirectiveId) => void }) {
  const { world, jevStatus } = snapshot;
  const room = world.level.rooms.find((room) => room.id === world.currentRoomId);
  const mode = world.slots.p2 === "MOCK_AI" ? "MOCK AI" : world.slots.p2 === "DISABLED" ? "DISABLED" : jevStatus?.mode.replace("_", " ").toUpperCase() ?? "CONNECTING";
  const downed = Object.values(world.players).find((p) => p.downed && p.alive && world.slots[p.id] !== "DISABLED");
  return (
    <>
      <header className="game-topbar">
        <button className="wordmark" aria-label="Quit to title" onClick={onQuit}>U+J <span>/ P(DOOM)</span></button>
        <span className="level-header">{world.level.name} <span className="muted">/ {String(world.level.rooms.findIndex((r) => r.id === world.currentRoomId) + 1).padStart(2, "0")}</span></span>
        <button className="small-button" onClick={onPause}>Pause <kbd>ESC</kbd></button>
      </header>
      <section className="hud" aria-label="Player status">
        {(["p1", "p2"] as const).map((id) => {
          const player = world.players[id];
          const disabled = world.slots[id] === "DISABLED";
          return <div className={`player-card ${id} ${disabled ? "disabled" : ""}`} key={id}>
            <CharacterMark jev={id === "p2"} />
            <div className="player-details">
              <div className="player-name"><strong>{id === "p1" ? "USER" : "JEV"}</strong><span>{disabled ? "DISABLED" : !player.alive ? "DEAD" : player.downed ? "DOWNED" : `${Math.ceil(player.health)} HP`}</span></div>
              <meter aria-label={`${id === "p1" ? "User" : "JEV"} health`} value={disabled ? 0 : player.health} max={MOVEMENT.maxHealth} />
              {id === "p2" && <JevActions player={player} slot={world.slots.p2} />}
              <div className="weapon-line"><span>{WEAPONS[player.weapon].label}</span><span>{player.ammo[player.weapon] ?? "∞"} <span className="muted">AMMO</span></span></div>
              <div className="dash-line">DASH <progress aria-label={`${id} dash readiness`} max={MOVEMENT.dashCooldownMs} value={MOVEMENT.dashCooldownMs - player.dashCooldownMs} /><span>{player.dashCooldownMs > 0 ? `${(player.dashCooldownMs / 1000).toFixed(1)}s` : "READY"}</span></div>
            </div>
          </div>;
        })}
        <div className="run-stats"><div><span>SCORE</span><strong>{world.score.toLocaleString().padStart(5, "0")}</strong></div><div><span>COINS</span><strong className="coin-count">{world.coins.toString().padStart(2, "0")}</strong></div><div><span>TIME</span><strong>{elapsedLabel(world.elapsedMs)}</strong></div></div>
      </section>
      <div className="mission-strip"><span><span className="signal-dot" /> {room?.objectiveText}</span><span className={`status-pill ${jevStatus?.mode ?? ""}`} title={jevStatus?.lastError ?? undefined}>{mode}{jevStatus?.lastLatencyMs != null ? ` / ${Math.round(jevStatus.lastLatencyMs)} MS` : ""}</span><DirectiveSelect directive={world.directive} disabled={world.slots.p2 === "DISABLED" || world.slots.p2 === "HUMAN" || world.status !== "playing"} onChange={onDirectiveChange} /></div>
      {downed && <p className="revive-prompt" role="status">{downed.id === "p1" ? "User" : "JEV"} is down. Stand nearby and hold {keyLabel(settings.bindings.interact[0])} to revive. {Math.ceil(downed.downedTimerMs / 1000)}s remaining.</p>}
    </>
  );
}
