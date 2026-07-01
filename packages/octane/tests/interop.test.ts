import { it, expect } from 'vitest';
import { mount } from './_helpers';
import { App, HostChildApp, MultiChildApp } from './_fixtures/interop-app.tsx';
import { TsrxApp } from './_fixtures/interop-app.tsrx';

// JSX backwards-compat interop: a React-style `.tsx` parent and a `.tsrx`
// `{props.children}` consumer compile via the same octane compiler but emit
// children differently (the `.tsx` return-JSX path lowers them to positional
// `createElement(Provider, {}, …)` args; the `.tsrx` `@{}` path threads a
// `children` render-fn prop). Both shapes must render through the consumer.

it('.tsx parent passes a single component child to a .tsrx {props.children} component', () => {
	const r = mount(App as any);
	expect(r.findAll('.provider').length).toBe(1); // Provider renders
	expect(r.findAll('.inner').length).toBe(1); // the .tsx child renders
	expect(r.find('.inner').textContent).toBe('hi');
	r.unmount();
});

it('.tsx parent passes a single host element child to a .tsrx {props.children} component', () => {
	const r = mount(HostChildApp as any);
	expect(r.findAll('.provider').length).toBe(1);
	expect(r.findAll('.h').length).toBe(1);
	expect(r.find('.h').textContent).toBe('x');
	r.unmount();
});

it('.tsx parent passes MULTIPLE children to a .tsrx {props.children} component', () => {
	const r = mount(MultiChildApp as any);
	expect(r.findAll('.provider').length).toBe(1);
	expect(r.findAll('.inner').length).toBe(1);
	expect(r.findAll('.h').length).toBe(1);
	expect(r.find('.inner').textContent).toBe('hi');
	expect(r.find('.h').textContent).toBe('x');
	r.unmount();
});

it('.tsrx parent still passes children through the same Provider (reverse case)', () => {
	const r = mount(TsrxApp as any);
	expect(r.findAll('.provider').length).toBe(1);
	expect(r.findAll('.inner').length).toBe(1);
	expect(r.find('.inner').textContent).toBe('hi');
	r.unmount();
});

import { createElement } from '../src/index';

function Comp() {
	return null;
}

it('createElement lifts `key` out of props (React semantics — key is never a prop)', () => {
	const el = createElement(Comp, { key: 'k1', foo: 1 } as any);
	expect(el.key).toBe('k1');
	expect('key' in (el.props as any)).toBe(false);
	expect((el.props as any).foo).toBe(1);
});

it('SERVER createElement lifts `key` out of props too (SSR ≡ client — no props.key divergence)', async () => {
	const { createElement: serverCreateElement } = await import('octane/server');
	const el = serverCreateElement(Comp as any, { key: 'k1', foo: 1 });
	expect(el.key).toBe('k1');
	expect('key' in (el.props as any)).toBe(false); // previously leaked on the server
	expect((el.props as any).foo).toBe(1);
	// …and it does NOT mutate the caller's object.
	const caller = { key: 'k2', bar: 2 } as any;
	serverCreateElement(Comp as any, caller);
	expect(caller.key).toBe('k2');
});

it('createElement does NOT mutate the caller-supplied props object', () => {
	const caller = { foo: 1 } as any;
	const el = createElement(Comp, caller, 'child');
	// children folded into the descriptor's props for the component path…
	expect((el.props as any).children).toBe('child');
	// …but the caller's object is untouched.
	expect(caller).toEqual({ foo: 1 });
	expect('children' in caller).toBe(false);
	expect(el.props).not.toBe(caller);
});

it('createElement keeps the hot 2-arg path allocation-free (props passed through)', () => {
	const caller = { foo: 1 } as any; // no key, no positional children
	const el = createElement(Comp, caller);
	expect(el.props).toBe(caller); // same reference — no copy
	expect(el.key).toBe(null);
});
