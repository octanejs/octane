// The renderer-bearing upstream suite lives in a TSRX fixture module.
// Ported from @xstate/react@6.1.0 test/useActor.test.tsx at commit
// d4f8c5b709291d44f70139a7f9ff333abd7c615c; see that fixture's header for the
// permitted transformations.
//
// Four cases in this file carry upstream's `suiteKey === 'strict' ? … : …`
// render/effect counts verbatim. Octane has no StrictMode double-invoke, so the
// adapted helper supplies only the non-strict mode and those expressions
// evaluate to upstream's own non-strict expectations.
// OCTANE DIVERGENCE[xstate-no-strictmode-double-invoke][runtime:7da379d6545503d7]
//
// One case routes a thrown actor error into an error boundary. Octane has no
// class components, so upstream's `class ErrorBoundary` becomes a `@try`/`@catch`
// component in the fixture; the assertion is unchanged.
// OCTANE DIVERGENCE[xstate-error-boundary-try-catch][runtime:c8ad212ab76dd248]
import '../_fixtures/upstream/useActor.tsrx';
