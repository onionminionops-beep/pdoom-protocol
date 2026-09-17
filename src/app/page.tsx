import Link from "next/link";

export default function Home() {
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100vh", fontFamily: "monospace" }}>
      <div style={{ textAlign: "center" }}>
        <h1>USER + JEV: P(DOOM) PROTOCOL</h1>
        <p>A co-op platform shooter where a human and TypeSafe&apos;s Jev share the same controls.</p>
        <Link href="/play">Play</Link>
      </div>
    </main>
  );
}
