// The xstate-store binding runs on the SAME octane runtime instance the fixtures
// compile against (`octane` resolves to packages/octane for both), so octane's
// test helpers are reused verbatim rather than standing up a parallel harness.
export { mount, act, nextPaint, flushEffects, createLog } from '../../octane/tests/_helpers';
