/**
 * Cross-realm value-kind tags. Every one of these is a `Symbol.for` registry
 * key, which makes the STRING the contract: the client runtime, the SSR
 * serializer, the universal core, and the React compat layers all recognize a
 * value by looking its tag up in the same global registry. A typo in any one of
 * them mints a different symbol and silently fails every `$$kind` identity
 * check that module performs, so each key is spelled exactly once, here.
 *
 * This leaf has no imports on purpose: a consumer that needs one tag must not
 * pull in the DOM tables or the renderer graph to get it.
 */

/** `createElement` descriptor marker. */
export const ELEMENT_TAG = /* @__PURE__ */ Symbol.for('octane.element');
/** `createPortal` descriptor marker. */
export const PORTAL_TAG = /* @__PURE__ */ Symbol.for('octane.portal');
/** React-compatible Fragment sentinel. */
export const FRAGMENT_TAG: unique symbol = /* @__PURE__ */ Symbol.for('octane.Fragment');
/** React-19 `<Activity>` sentinel. */
export const ACTIVITY_TAG: unique symbol = /* @__PURE__ */ Symbol.for('octane.Activity');
/** Native Octane context object marker. */
export const CONTEXT_TAG = /* @__PURE__ */ Symbol.for('octane.context');
/** `lazy()` wrapper marker. */
export const LAZY_COMPONENT_TAG = /* @__PURE__ */ Symbol.for('octane.lazy');
/** Suspense boundary component type. */
export const SUSPENSE_TAG = /* @__PURE__ */ Symbol.for('octane.suspense');
/** Lexical children body marker. */
export const CHILDREN_BLOCK_TAG: unique symbol = /* @__PURE__ */ Symbol.for('octane.childrenBlock');
/** Owner stamp for a renderer region's host boundary. */
export const RENDERER_REGION_OWNER_TAG = /* @__PURE__ */ Symbol.for('octane.renderer-region.owner');

/**
 * React 19 context objects carry this `$$typeof`. Octane only ever READS it to
 * recognize a foreign React context, but it is the same registry contract.
 */
export const REACT_CONTEXT_TAG = /* @__PURE__ */ Symbol.for('react.context');
