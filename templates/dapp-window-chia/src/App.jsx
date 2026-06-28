import { useState } from "react";
import { connectWallet } from "./wallet.js";

export default function App() {
  const [provider, setProvider] = useState(null);
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onConnect() {
    setError("");
    setBusy(true);
    try {
      const p = await connectWallet();
      setProvider(p);
      setAddress(await p.getAddress());
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onSign() {
    setError("");
    try {
      // The dev-shim wallet (in `digstore dev`) does NOT sign — open in the DIG Browser or connect a
      // real wallet to produce a real signature.
      const { signature } = await provider.signMessage("Login to __DISPLAY_NAME__");
      alert("Signature: " + signature.slice(0, 24) + "…");
    } catch (e) {
      setError(e?.message ?? String(e));
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
        here — you only spend 100 DIG when you publish with <code>digstore deploy</code>.
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

      {error && <p className="error">{error}</p>}

      <pre>
        <code>{`digstore dev      # preview + dev wallet shim, free
digstore deploy   # publish a capsule (100 DIG)`}</code>
      </pre>
    </main>
  );
}
