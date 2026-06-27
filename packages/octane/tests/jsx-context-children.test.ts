import { it, expect, vi } from 'vitest';
import { flushSync } from '../src/index.js';
import { mount } from './_helpers';
import {
	ProviderApp,
	ReconcileApp,
	InputApp,
	InputListApp,
	bumpCount,
	reRenderParent,
	reRenderField,
	reRenderList,
} from './_fixtures/jsx-context-children.tsx';

// JSX backwards-compat: a React-style `.tsx` `<Ctx.Provider value>` with element
// children, and host elements with component children produced via `createElement`
// from control-flow returns (the de-opt path), must render and reconcile.

it('.tsx <Context.Provider> renders element-descriptor children and provides context', () => {
	const r = mount(ProviderApp as any);
	// The host <div class="wrap"> with component children renders (de-opt host path).
	expect(r.findAll('.wrap').length).toBe(1);
	// The Provider's JSX children render — both leaves.
	expect(r.findAll('.leaf').length).toBe(2);
	// Context flows to the leaves through the createElement path.
	for (const el of r.findAll('.leaf')) expect(el.textContent).toBe('provided');
	r.unmount();
});

it('.tsx host element with component children reconciles (child state survives parent re-render)', () => {
	const r = mount(ReconcileApp as any);
	expect(r.find('.count').textContent).toBe('0');
	flushSync(() => bumpCount());
	expect(r.find('.count').textContent).toBe('1');
	// Re-render the PARENT: the de-opt host (<div class="host">) and its <Counter>
	// child must RECONCILE (preserve state), not rebuild back to 0.
	flushSync(() => reRenderParent());
	expect(r.find('.count').textContent).toBe('1');
	r.unmount();
});
