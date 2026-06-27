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

it('.tsx pure-host de-opt node is REUSED across a re-render (DOM state survives)', () => {
	const r = mount(InputApp as any);
	const input = r.find('.field') as HTMLInputElement;
	// Simulate DOM-resident state a rebuild would destroy: a typed value + a class.
	input.value = 'typed';
	input.classList.add('marked');
	// Re-render the parent. The de-opt path must REUSE the <input> node, not rebuild.
	flushSync(() => reRenderField());
	const input2 = r.find('.field') as HTMLInputElement;
	expect(input2).toBe(input); // same node — not recreated
	expect(input2.value).toBe('typed'); // DOM-resident state survived
	expect(input2.classList.contains('marked')).toBe(true);
	r.unmount();
});

it('.tsx pure-host de-opt LIST items are reused across a re-render (per-item DOM state survives)', () => {
	const r = mount(InputListApp as any);
	const inputs = r.findAll('.li') as HTMLInputElement[];
	expect(inputs.length).toBe(3);
	inputs.forEach((el, i) => (el.value = 'v' + i));
	flushSync(() => reRenderList());
	const inputs2 = r.findAll('.li') as HTMLInputElement[];
	expect(inputs2.length).toBe(3);
	inputs2.forEach((el, i) => {
		expect(el).toBe(inputs[i]); // same node per item (deoptItemBody reuse)
		expect(el.value).toBe('v' + i); // typed value survived
	});
	r.unmount();
});

it('positional component children do NOT emit the de-opt "missing key" warning', () => {
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	try {
		const r = mount(ProviderApp as any); // renders <div><CtxLeaf/><CtxLeaf/></div>
		const keyWarnings = warn.mock.calls.filter((c) => String(c[0]).includes('unique "key"'));
		expect(keyWarnings.length).toBe(0);
		r.unmount();
	} finally {
		warn.mockRestore();
	}
});
