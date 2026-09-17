"use client";

import Image from "next/image";
import { useState } from "react";
import manifest from "../../public/art/manifest.json";

export function CharacterMark({ jev = false, fullBody = false }: { jev?: boolean; fullBody?: boolean }) {
  const [failed, setFailed] = useState(false);
  const sheet = manifest.characters[jev ? "jev" : "user"];
  if (!failed && fullBody) {
    return <svg className="character-mark full-body" viewBox={`0 0 ${sheet.frameWidth} ${sheet.frameHeight}`} aria-hidden="true">
      <image href={`/art/${sheet.file}`} width={sheet.frameWidth * Math.max(...sheet.anims.map((anim) => anim.frames))} height={sheet.frameHeight * sheet.anims.length} onError={() => setFailed(true)} />
    </svg>;
  }
  if (!failed) {
    return <Image className="character-mark portrait" src={`/art/${jev ? manifest.ui.portraitJev : manifest.ui.portraitUser}`} width={96} height={96} alt="" unoptimized onError={() => setFailed(true)} />;
  }
  return (
    <svg viewBox="0 0 48 64" fill="none" aria-hidden="true" className="character-mark" shapeRendering="crispEdges">
      <path d="M10 7h27v20H10zM7 29h31v22H7z" fill={jev ? "var(--magenta)" : "var(--cyan)"} />
      <path d="M9 5h27v8H9zM14 13h20v6H14z" fill="#182b41" />
      <path d={jev ? "M16 15h5v3h-5zM27 15h5v3h-5z" : "M23 15h9v3h-9z"} fill="#e6fbef" />
      <path d="M9 46h10v15H9zM27 46h10v15H27z" fill="#354c65" />
      <path d="M19 33h26v7H19z" fill="#ccd9df" />
      <path d="M39 34h7v5h-7zM2 58h18v5H2zM25 58h16v5H25z" fill="#172d43" />
      {jev && <path d="M16 24h13v2H16zM21 0h4v6h-4z" fill="#e6fbef" />}
    </svg>
  );
}
