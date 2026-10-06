// Shared only by early bindings and hydration. Keep the adopter/compiler and
// source subscriptions out of the renderer's dependency graph. Undefined means
// reserved but not yet published; null is a published absent attribute/style.
export const domBindingClaims = /* @__PURE__ */ new WeakMap<
	Element,
	Map<string, string | null | undefined>
>();
