import { useState } from "react";
import { connectWallet, mint } from "./mint.js";

export default function App() {
  const [provider, setProvider] = useState(null);
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  // The WalletConnect pairing URI (only set during the WC → Sage fallback) — show it as a copy-link
  // / QR / deep link so the visitor can approve in Sage.
  const [wcUri, setWcUri] = useState("");

  async function onConnect() {
    setError("");
    setWcUri("");
    try {
      // Injected window.chia when present (DIG Browser / extension); otherwise WalletConnect → Sage.
      // `onUri` fires only on the WC path, with the pairing URI to render.
      const p = await connectWallet({ onUri: (uri) => setWcUri(uri) });
      setProvider(p);
      setAddress(await p.getAddress());
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setWcUri(""); // pairing complete (or failed) — drop the URI
    }
  }

  async function onMint() {
    setError("");
    setStatus("Building the mint spend…");
    try {
      // Minting spends real funds and is wallet-signed — never auto-invoked. Wire your collection in
      // src/mint.js. The dev-shim wallet (in `digstore dev`) cannot sign; use the DIG Browser.
      await mint(provider);
      setStatus("Minted!");
    } catch (e) {
      setStatus("");
      setError(e?.message ?? String(e));
    }
  }

  return (
    <main className="wrap">
      <h1>__DISPLAY_NAME__</h1>
      <p>
        An NFT drop on the <strong>DIG Network</strong> — mint NFTs whose media can live in a DIG
        capsule, truly permanent on Chia.
      </p>
      <p className="muted">
        Building and previewing this mint page are <strong>free</strong> — no mint, no chain, no spend
        when you scaffold or run it. Publishing the page is one <code>digstore deploy</code> (100 DIG).
        Minting the NFTs is a separate, wallet-signed on-chain action a visitor triggers.
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
          <button onClick={onMint}>Mint</button>
          {status && <p className="muted">{status}</p>}
        </div>
      ) : (
        <button onClick={onConnect}>Connect wallet to mint</button>
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
        <code>{`digstore dev      # preview the mint page, free
digstore deploy   # publish the page as a capsule (100 DIG)`}</code>
      </pre>
    </main>
  );
}
