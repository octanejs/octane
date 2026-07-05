// `fireEvent` — dom-testing-library's, re-exported UNWRAPPED.
//
// react-testing-library layers remappings on top of dom-testing-library's
// fireEvent because React's synthetic event system listens to DIFFERENT native
// events than the handler names suggest (mouseEnter handlers run off native
// mouseover, focus/blur off focusin/focusout, `select` is synthesized from key
// events, `onChange` fires on native input, …), so RTL double-dispatches to
// feed React's plugins.
//
// Octane has NO synthetic event layer — `onX` handlers receive the native `x`
// event, delegated. `fireEvent.mouseEnter` therefore dispatches a real
// `mouseenter` and octane's capture-phase delegation of non-bubbling events
// delivers it; `fireEvent.change` fires a native `change` (NOT React's
// input-as-change); no remapping is wanted. The commit wiring (flushSync +
// effect drain around every dispatch) rides on dom-testing-library's
// `eventWrapper` config hook — see pure.ts.
export { fireEvent } from '@testing-library/dom';
