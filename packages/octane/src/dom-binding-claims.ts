// Shared only by early bindings and hydration. Keep the adopter/compiler and
// source subscriptions out of the renderer's dependency graph. Undefined means
// reserved but not yet published; null is a published absent attribute or style
// declaration. A whole style publishes its CSS text, '' with no declarations.
export const domBindingClaims = /* @__PURE__ */ new WeakMap<
	Element,
	Map<string, string | null | undefined>
>();
