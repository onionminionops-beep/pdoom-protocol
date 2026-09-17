"use client";

import { useState } from "react";
import { ACTIONS, defaultSettings, keyLabel, remapKey, type ClientSettings, type InputAction } from "@/game/client/settings";

export function SettingsPanel({ settings, onChange, onBack }: { settings: ClientSettings; onChange: (settings: ClientSettings) => void; onBack: () => void }) {
  const [remapping, setRemapping] = useState<InputAction | null>(null);
  const [message, setMessage] = useState("");
  return <section className="settings-panel" onKeyDownCapture={(event) => {
    if (!remapping) return;
    event.stopPropagation();
    event.preventDefault();
    if (event.code === "Escape") { setRemapping(null); return; }
    const bindings = remapKey(settings.bindings, remapping, event.code);
    if (bindings) { onChange({ ...settings, bindings }); setRemapping(null); setMessage(""); }
    else setMessage("That key is reserved or already assigned. Choose another.");
  }}>
    <p className="eyebrow">SYSTEM PREFERENCES</p><h2>Make it yours.</h2>
    <div className="volume-controls">{(["master", "music", "sfx"] as const).map((channel) => <label key={channel}>{channel.toUpperCase()} <span>{Math.round(settings[channel] * 100)}%</span><input aria-label={`${channel} volume`} type="range" min="0" max="1" step="0.05" value={settings[channel]} onChange={(event) => onChange({ ...settings, [channel]: Number(event.target.value) })} /></label>)}</div>
    <div className="visual-settings">
      <label><input type="checkbox" checked={settings.screenShake} onChange={(event) => onChange({ ...settings, screenShake: event.target.checked })} /> Screen shake</label>
      <label><input type="checkbox" checked={settings.reducedFlashing} onChange={(event) => onChange({ ...settings, reducedFlashing: event.target.checked })} /> Reduced flashing</label>
      <label><input type="checkbox" checked={settings.colorblind} onChange={(event) => onChange({ ...settings, colorblind: event.target.checked })} /> Colorblind-safe palette</label>
    </div>
    <h3>Human key bindings</h3>
    <div className="binding-grid">{ACTIONS.map((action) => <button key={action} className="binding-button" aria-label={`Remap ${action}`} onClick={() => { setRemapping(action); setMessage(""); }}><span>{action}</span><kbd>{remapping === action ? "PRESS KEY…" : settings.bindings[action].map(keyLabel).join(" / ")}</kbd></button>)}</div>
    <p role="status" className="settings-message">{message || (remapping ? "Press a key. Escape cancels." : "Changes apply immediately for this visit.")}</p>
    <div className="dialog-actions"><button className="primary-button" onClick={onBack}>Back</button><button className="text-button" onClick={() => onChange(defaultSettings(window.matchMedia("(prefers-reduced-motion: reduce)").matches))}>Reset defaults</button></div>
  </section>;
}
