import { useState } from "react";
import type { ChiaProvider } from "@dignetwork/dig-sdk";
import { connectWallet } from "./wallet.ts";

export default function App() {
  const [provider, setProvider] = useState<ChiaProvider | null>(null);
  const [address, setAddress] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  // The WalletConnect pairing URI (only set during the WC → Sage fallback) — render it as a
  // copy-link / QR / deep link so the user can approve in Sage.
  const [wcUri, setWcUri] = useState<string>("");

  async function onConnect() {
    setError("");
    setWcUri("");
    setBusy(true);
    try {
      // Injected window.chia when present (DIG Browser / extension); otherwise WalletConnect → Sage.
      // `onUri` fires only on the WC path, with the pairing URI to show.
      const p = await connectWallet({ onUri: (uri) => setWcUri(uri) });
      setProvider(p);
      setAddress((await p.getAddress()) ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setWcUri(""); // pairing complete (or failed) — drop the URI
    }
  }

  async function onSign() {
    if (!provider) return;
    setError("");
    try {
      // The dev-shim wallet (in `digstore dev`) does NOT sign — open in the DIG Browser or connect a
      // real wallet to produce a real signature.
      const { signature } = await provider.signMessage("Login to __DISPLAY_NAME__");
      alert("Signature: " + (signature ?? "").slice(0, 24) + "…");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main className="wrap">
      <h1>__DISPLAY_NAME__</h1>
      <p>
        A wallet-wired dapp on the <strong>DIG Network</strong>. Your wallet is your account — no
        email, no password.
      </p>
      <p className="muted">
        Connecting and previewing are <strong>free</strong>. There is no mint, no chain, and no spend
        here — you only spend $DIG when you publish with <code>digstore deploy</code>.
      </p>

      {address ? (
        <div className="card">
          <div className="row">
            <span className="muted">Connected via</span>
            <strong>{provider?.backend}</strong>
          </div>
          <div className="row">
            <span className="muted">Address</span>
            <code>{address}</code>
          </div>
          <button onClick={onSign}>Sign a login message</button>
        </div>
      ) : (
        <button onClick={onConnect} disabled={busy}>
          {busy ? "Connecting…" : "Connect wallet"}
        </button>
      )}

      {wcUri && (
        <div className="card">
          <p className="muted">
            Scan or open this in <strong>Sage</strong> to connect (WalletConnect):
          </p>
          <code>{wcUri}</code>
          <button onClick={() => navigator.clipboard?.writeText(wcUri)}>Copy pairing link</button>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <pre>
        <code>{`digstore dev      # preview + dev wallet shim, free
digstore deploy   # publish a capsule ($DIG)`}</code>
      </pre>
    </main>
  );
}
