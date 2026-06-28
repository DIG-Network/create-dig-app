export default function Home() {
  return (
    <main className="wrap">
      <h1>__DISPLAY_NAME__</h1>
      <p>
        A Next.js static-export site on the <strong>DIG Network</strong> — served from a network no
        host can read, change, or take down.
      </p>
      <p className="muted">
        Build and preview for <strong>free</strong>. You only spend 100 DIG when you publish.
      </p>
      <pre>
        <code>{`digstore dev      # preview, free
digstore deploy   # publish a capsule (100 DIG)`}</code>
      </pre>
    </main>
  );
}
