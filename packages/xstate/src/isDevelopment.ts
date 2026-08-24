// Replaces @xstate/react@6.1.0's `#is-development` subpath import.
//
// Upstream resolves `#is-development` to `src/true.ts` or `src/false.ts` through
// a package-`imports` map keyed on the `development` export condition, because it
// publishes a prebuilt `dist/`. This package publishes raw `src/`, so the
// condition never gets a chance to run in the consumer's bundler for our
// modules; the equivalent, and the thing every bundler already constant-folds, is
// the NODE_ENV probe.
//
// `process` is declared locally rather than pulled from @types/node: this module
// ships to consumers, and their program must not be forced to include Node types
// to typecheck it. The same idiom is used by @octanejs/jotai.
declare const process: { env: { NODE_ENV?: string } };

const isDevelopment = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';

export default isDevelopment;
