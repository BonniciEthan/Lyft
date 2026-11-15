/**
 * Build edition.
 * - "server" (default): syncs with your self-hosted Lyft server.
 * - "local": standalone build for friends — no server, no settings, starts empty,
 *   everything stays on their own computer. Built with `npm run build:local`.
 */
export const IS_LOCAL = import.meta.env?.VITE_EDITION === 'local';
