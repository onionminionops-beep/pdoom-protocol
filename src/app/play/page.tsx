"use client";

import dynamic from "next/dynamic";

const GameShell = dynamic(() => import("@/components/GameShell"), {
  ssr: false,
  loading: () => <main className="loading-screen">P(DOOM) PROTOCOL / establishing signal…</main>,
});

export default function PlayPage() {
  return <GameShell />;
}
