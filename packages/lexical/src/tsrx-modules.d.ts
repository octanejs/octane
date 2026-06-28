// Ambient declaration so the `.ts` barrel + hooks can import this package's `.tsrx`
// components/nodes. tsgo doesn't understand `.tsrx` (the octane compiler does), so a
// single ambient module declares them all — no per-component `.d.ts` sidecar.
declare module '*.tsrx';
