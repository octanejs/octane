// The `react/jsx-runtime` compat entry — maps the automatic-runtime factories
// onto Octane's `createElement` (children arrive on `props.children`, which is
// the 2-arg `createElement(type, props)` form Octane's de-opt reconciler
// already renders, e.g. radix's `createElement('div', { children })`).
//
// IMPORTANT — this only bridges *rendering* of pre-compiled `jsx()` output. It
// does NOT make a compiled npm package runnable: hooks in that output are
// slotless (`useState(0)`) and throw `missingSlot()` at runtime, because
// slotting happens in Octane's compiler over *source*, not here. This entry
// exists to mark that boundary precisely, not to cross it. The supported path
// is source-level bridging (see codemod.mjs), which routes through the compiler.
import { createElement, Fragment } from 'octane';

export { Fragment };

export function jsx(type: unknown, props: unknown, _key?: unknown): unknown {
	return createElement(type as never, props as never);
}

export const jsxs = jsx;

export function jsxDEV(type: unknown, props: unknown, _key?: unknown): unknown {
	return createElement(type as never, props as never);
}
