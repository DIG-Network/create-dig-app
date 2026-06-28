/// <reference types="vite/client" />

// Type the WalletConnect projectId env so `import.meta.env.VITE_WALLETCONNECT_PROJECT_ID`
// typechecks. Set its value in `.env` / `.env.local` (see .env.example).
interface ImportMetaEnv {
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
