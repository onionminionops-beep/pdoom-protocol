"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import manifest from "../../public/art/manifest.json";
import { DIRECTIVES, type DirectiveId } from "@/game/contracts/directives";
import type { SessionOptions } from "@/game/client/session";
import type { SlotKind } from "@/game/sim/types";
import { CharacterMark } from "./CharacterMark";

export function TitleScreen({ options, onOptions, onStart, onSettings }: {
  options: SessionOptions;
  onOptions: (options: SessionOptions) => void;
  onStart: () => void;
  onSettings: () => void;
}) {
  const directive = DIRECTIVES[options.directive];
  const [logoFailed, setLogoFailed] = useState(false);
  return (
    <main className="title-screen">
      <header className="site-header">
        <Link className="wordmark" href="/">U+J <span>/ P(DOOM) PROTOCOL</span></Link>
        <span className="edition">CO-OP FIELD EXPERIMENT / 001</span>
      </header>
      <div className="title-layout">
        <section className="title-copy">
          <p className="eyebrow"><span className="signal-dot" /> CONSENSUS HEIGHTS IS OFFLINE</p>
          <p className="duo-label">USER <span>+</span> JEV</p>
          <h1>P(DOOM)<br /><span>PROTOCOL</span><span className="title-period">.</span></h1>
          <p className="title-description">One human. One AI. Same controls.<br />Fight through the noise. Restore independent thought.</p>
          <div className="title-art" aria-label="User and JEV standing above the Consensus Heights skyline" role="img">
            <div className="city-grid" />
            {Object.entries(manifest.backdrops).map(([key, layer]) => <div key={key} className={`title-backdrop ${key}`} style={{ backgroundImage: `url("/art/${layer.file}")`, backgroundSize: `${layer.width}px ${layer.height}px` }} />)}
            {!logoFailed && <Image className="title-crest" src={`/art/${manifest.ui.logo}`} width={384} height={128} alt="" unoptimized onError={() => setLogoFailed(true)} />}
            <div className="hero-pair"><CharacterMark fullBody /><CharacterMark jev fullBody /></div>
            <span className="art-caption">TWO PLAYERS / ONE SHARED REALITY</span>
          </div>
        </section>
        <section className="launch-panel" aria-labelledby="setup-title">
          <div className="panel-heading"><span className="eyebrow">01 / CONNECT YOUR CREW</span><span className="tiny-tag">60 HZ</span></div>
          <h2 id="setup-title">Choose your sidekick.</h2>
          <div className="slot-selectors">
            {(["p1", "p2"] as const).map((id) => (
              <label className={`slot-selector ${id}`} key={id}>
                <span className="slot-name">{id === "p1" ? "01 / USER" : "02 / JEV"}</span>
                <select aria-label={`${id === "p1" ? "P1" : "P2"} controller`} value={options.slots[id]} onChange={(event) => onOptions({ ...options, slots: { ...options.slots, [id]: event.target.value as SlotKind } })}>
                  {(id === "p1" ? ["HUMAN", "MOCK_AI", "DISABLED"] : ["JEV", "MOCK_AI", "DISABLED"]).map((kind) => <option key={kind} value={kind}>{kind.replace("_", " ")}</option>)}
                </select>
              </label>
            ))}
          </div>
          <fieldset className="directive-picker">
            <legend className="eyebrow">02 / JEV DIRECTIVE</legend>
            <div className="directive-options">
              {(Object.keys(DIRECTIVES) as DirectiveId[]).map((id) => (
                <label key={id} className={options.directive === id ? "directive selected" : "directive"}>
                  <input type="radio" name="directive" value={id} checked={options.directive === id} onChange={() => onOptions({ ...options, directive: id })} />
                  {DIRECTIVES[id].label}
                </label>
              ))}
            </div>
            <p className="directive-description">{directive.blurb}</p>
          </fieldset>
          <button className="primary-button start-button" onClick={onStart} disabled={options.slots.p1 === "DISABLED" && options.slots.p2 === "DISABLED"}>Start protocol <span aria-hidden="true">→</span></button>
          <p className="launch-note">JEV uses TypeSafe when connected. Mock AI plays offline.</p>
          <button className="text-button settings-link" onClick={onSettings}>Settings & key bindings <span aria-hidden="true">↗</span></button>
        </section>
      </div>
      <footer className="title-footer"><span>NO AIM ASSIST. NO HIDDEN ADVANTAGE.</span><span>MOVE <kbd>A</kbd><kbd>D</kbd> &nbsp; JUMP <kbd>SPACE</kbd> &nbsp; FIRE <kbd>J</kbd> &nbsp; DASH <kbd>K</kbd> &nbsp; INTERACT <kbd>E</kbd></span></footer>
    </main>
  );
}
