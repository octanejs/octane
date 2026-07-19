/// <reference types="vite/client" />

// Octane islands are compiled by the Octane toolchain, not tsc; the shell
// imports them as opaque modules and passes them to <OctaneCompat> untyped.
declare module '*.tsrx';
