// Shared only by early bindings and hydration. Keep the adopter/compiler and
// source subscriptions out of the renderer's dependency graph. Undefined means
// reserved but not yet published; null is a published absent attribute/style.
export const domBindingClaims = /* @__PURE__ */ new WeakMap<
	Element,
	Map<string, string | null | undefined>
>();

// Parents whose children hydration mismatch recovery changed. An early-bound
// host in one of them can lose a stale server neighbor without having moved.
// Only a lease that hydration has claimed or retired honors it (dom-bindings).
export const repairedServerParents = /* @__PURE__ */ new WeakSet<Node>();
