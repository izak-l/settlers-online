/// <reference types="vite/client" />

/** Injected by vite.config.ts. Only public values belong here. */
declare const __SUPABASE_URL__: string;
/** Supabase publishable (anon) key: safe in the browser by design. */
declare const __SUPABASE_KEY__: string;
declare const __SERVER_URL__: string;
/** True only in `pnpm dev` with AUTH_MODE=dev. */
declare const __DEV_AUTH__: boolean;
