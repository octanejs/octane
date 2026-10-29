// goober's runtime, unchanged. goober 2.1.19 declares its types with `export =`
// inside a "type": "module" package, which TypeScript rejects (TS1203) whenever
// library checking is on (cristianbote/goober#606). Importing goober through this
// module keeps that declaration file out of every consumer's program; the
// sibling goober.d.ts types the part react-hot-toast uses.
export { css, keyframes } from 'goober';
