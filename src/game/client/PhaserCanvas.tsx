"use client";

import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { VIEW_HEIGHT, VIEW_WIDTH } from "./camera";
import { ProtocolScene } from "./scene";
import type { ClientSession } from "./session";

export default function PhaserCanvas({ session }: { session: ClientSession }) {
  const parent = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!parent.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: parent.current,
      width: VIEW_WIDTH,
      height: VIEW_HEIGHT,
      backgroundColor: "#07101d",
      pixelArt: true,
      antialias: false,
      roundPixels: true,
      banner: false,
      audio: { noAudio: true },
      input: { keyboard: false, mouse: false, touch: false, gamepad: false },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: new ProtocolScene(session),
    });
    return () => game.destroy(true);
  }, [session]);

  return <div className="canvas-host" ref={parent} data-testid="game-canvas" />;
}
