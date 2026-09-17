"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClientAudio } from "@/game/client/audio";
import { ClientSession, type ClientSnapshot, type SessionOptions } from "@/game/client/session";
import { defaultSettings, keyLabel, type ClientSettings } from "@/game/client/settings";
import { DIRECTIVES } from "@/game/contracts/directives";
import { Hud } from "./Hud";
import { Modal } from "./Modal";
import { SettingsPanel } from "./SettingsPanel";
import { TitleScreen } from "./TitleScreen";

const PhaserCanvas = dynamic(() => import("@/game/client/PhaserCanvas"), { ssr: false, loading: () => <p className="loading-screen">Connecting to Consensus Heights…</p> });

export default function GameShell() {
  const [options, setOptions] = useState<SessionOptions>({ slots: { p1: "HUMAN", p2: "JEV" }, directive: "GUARDIAN" });
  const [settings, setSettings] = useState(() => defaultSettings(typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches));
  const [audio] = useState(createClientAudio);
  const [session, setSession] = useState<ClientSession | null>(null);
  const sessionRef = useRef<ClientSession | null>(null);
  const [snapshot, setSnapshot] = useState<ClientSnapshot | null>(null);
  const [paused, setPaused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const [hitboxes, setHitboxes] = useState(false);
  const [slowMotion, setSlowMotion] = useState(false);

  const pause = useCallback((value: boolean) => {
    sessionRef.current?.setPaused(value);
    setPaused(value);
    if (!value) requestAnimationFrame(() => document.querySelector("canvas")?.focus());
  }, []);

  useEffect(() => {
    const visibility = () => { if (document.hidden && sessionRef.current) pause(true); };
    const keys = (event: KeyboardEvent) => {
      if (event.code !== "Escape" || event.repeat || document.querySelector("dialog[open]") || !sessionRef.current) return;
      event.preventDefault();
      pause(true);
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("keydown", keys);
      sessionRef.current?.dispose();
      audio.dispose();
    };
  }, [audio, pause]);

  function start() {
    sessionRef.current?.dispose();
    const developer = process.env.NEXT_PUBLIC_ENABLE_DEV_PANEL === "true" ||
      (process.env.NODE_ENV === "development" && new URLSearchParams(window.location.search).get("dev") === "1");
    void audio.unlock();
    const next = new ClientSession(options, settings, audio, developer);
    next.onSnapshot = setSnapshot;
    sessionRef.current = next;
    setSession(next);
    setPaused(false);
    setShowSettings(false);
    setHitboxes(false);
    setSlowMotion(false);
    next.publish();
  }

  function quit() {
    sessionRef.current?.dispose();
    sessionRef.current = null;
    setSession(null);
    setSnapshot(null);
    setPaused(false);
    setShowSettings(false);
  }

  function updateSettings(value: ClientSettings) {
    setSettings(value);
    sessionRef.current?.setSettings(value);
    audio.setMasterVolume(value.master);
    audio.setMusicVolume(value.music);
    audio.setSfxVolume(value.sfx);
  }

  const ended = snapshot && snapshot.world.status !== "playing";
  return <div className={settings.colorblind ? "app-shell colorblind" : "app-shell"}>
    {!session || !snapshot ? <TitleScreen options={options} onOptions={setOptions} onStart={start} onSettings={() => setShowSettings(true)} /> :
      <main className="game-shell">
        <Hud snapshot={snapshot} settings={settings} onPause={() => pause(true)} onQuit={quit} />
        <section className="viewport-frame" aria-label="Game viewport"><PhaserCanvas session={session} /></section>
        <footer className="game-footer">
          <span>MOVE <kbd>{keyLabel(settings.bindings.left[0])}</kbd><kbd>{keyLabel(settings.bindings.right[0])}</kbd> &nbsp; JUMP <kbd>{keyLabel(settings.bindings.jump[0])}</kbd> &nbsp; FIRE <kbd>{keyLabel(settings.bindings.shoot[0])}</kbd> &nbsp; DASH <kbd>{keyLabel(settings.bindings.dash[0])}</kbd> &nbsp; INTERACT <kbd>{keyLabel(settings.bindings.interact[0])}</kbd></span>
          {session.developer ? <button className="text-button" aria-expanded={devOpen} onClick={() => setDevOpen(!devOpen)}>Dev panel {devOpen ? "−" : "+"}</button> : <span>IDENTICAL PHYSICS / INDEPENDENT DECISIONS</span>}
        </footer>
        {session.developer && devOpen && <aside className="dev-panel" aria-label="Developer panel">
          <div className="dev-heading"><h2>JEV / observation feed</h2><span>TICK {snapshot.world.tick} / {snapshot.fps} FPS</span></div>
          <div className="dev-switches"><label><input type="checkbox" checked={hitboxes} onChange={(event) => { setHitboxes(event.target.checked); if (sessionRef.current) sessionRef.current.hitboxes = event.target.checked; }} /> Hitboxes</label><label><input type="checkbox" checked={slowMotion} onChange={(event) => { setSlowMotion(event.target.checked); if (sessionRef.current) sessionRef.current.slowMotion = event.target.checked; }} /> Slow motion (¼ speed)</label></div>
          <div className="dev-columns"><section><h3>Observation / p2</h3><pre tabIndex={0}>{JSON.stringify(snapshot.observation, null, 2)}</pre></section><section><h3>Last decision / probabilities</h3><pre tabIndex={0}>{JSON.stringify(snapshot.decision, null, 2) ?? "No decision available."}</pre></section></div>
        </aside>}
      </main>}
    {showSettings ? <Modal title="Settings" onClose={() => setShowSettings(false)}><SettingsPanel settings={settings} onChange={updateSettings} onBack={() => setShowSettings(false)} /></Modal> :
      ended ? <Modal title={snapshot.world.status === "won" ? "Victory" : "Defeat"} onClose={quit}>
        <p className="eyebrow">EPISODE COMPLETE</p><h2>{snapshot.world.status === "won" ? "Signal restored." : "Signal lost."}</h2>
        <p className="result-score">{snapshot.world.score.toLocaleString()} <span>POINTS</span></p>
        <dl className="score-breakdown">{Object.entries(snapshot.world.breakdown).map(([key, value]) => <div key={key}><dt>{({ kills: "Enemies defeated", coins: "Coins", timeBonus: "Time bonus", damageTakenPenalty: "Damage penalty", reviveBonus: "Revive bonus" })[key]}</dt><dd>{key === "damageTakenPenalty" ? "−" : "+"}{value}</dd></div>)}</dl>
        <div className="dialog-actions"><button className="primary-button" onClick={start}>Play again</button><button className="text-button" onClick={quit}>Return to title</button></div>
      </Modal> : paused && session ? <Modal title="Game paused" onClose={() => pause(false)}>
        <p className="eyebrow">CONNECTION HELD</p><h2>Take a breath.</h2><p className="pause-copy">The city can wait. Your next move is yours.</p>
        <p className="pause-directive">JEV DIRECTIVE / {DIRECTIVES[options.directive].label.toUpperCase()}</p>
        <div className="pause-actions"><button className="primary-button" onClick={() => pause(false)}>Resume protocol</button><button className="secondary-button" onClick={start}>Restart episode</button><button className="secondary-button" onClick={() => setShowSettings(true)}>Settings</button><button className="text-button" onClick={quit}>Quit to title</button></div>
      </Modal> : null}
  </div>;
}
