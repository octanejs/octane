import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from '../_helpers';
import { createContext, createElement, flushSync, useContext, useState } from '../../src/index.js';

// React's IMPLICIT same-element bailout (ReactFiberBeginWork's
// `oldProps === newProps` skip): re-rendering a parent that passes an IDENTICAL
// (reference-equal) element as a child must NOT re-render that child's body —
// while a context change still reaches consumers inside the bailed subtree via
// lazy propagation. This is the contract Radix/Base-UI providers rely on with a
// bare `{children}` passthrough — previously octane needed an explicit `memo()`
// shim (MemoChildren) to express it.
//
// Per ReactNewContext-test.js:624 ('consumer bails out if value is unchanged
// and something above bailed out') and ReactContextPropagation-test.js:217
// ('context change punches through memo/bailed trees').

const Ctx = createContext<number>(0);

function harness() {
	const log: string[] = [];
	let bump: (() => void) | null = null;

	function Consumer() {
		const v = useContext(Ctx);
		log.push('consumer:' + v);
		return createElement('span', { id: 'c', children: String(v) });
	}

	function NonConsumer() {
		log.push('non-consumer');
		return createElement('span', { id: 'nc', children: 'x' });
	}

	function Provider(props: any) {
		const [n, setN] = useState(0, Symbol.for('ieb.n'));
		bump = () => setN((x: number) => x + 1);
		log.push('provider:' + n);
		// NO memo() shim: children is the same element reference the App created
		// once — React bails on it implicitly.
		return createElement(Ctx.Provider, { value: n, children: props.children });
	}

	return { log, bumpRef: () => bump!, Consumer, NonConsumer, Provider };
}

describe('implicit same-element bailout', () => {
	it('a cached single child element is not re-rendered; its consumer still refreshes', () => {
		const h = harness();
		function Wrap(props: any) {
			h.log.push('wrap');
			return createElement('div', { children: props.children });
		}
		function App() {
			return createElement(h.Provider, {
				children: createElement(Wrap, {
					children: createElement(h.Consumer, {}),
				}),
			});
		}
		const r = mount(App as any);
		flushEffects();
		expect(h.log).toEqual(['provider:0', 'wrap', 'consumer:0']);

		h.log.length = 0;
		flushSync(() => h.bumpRef()());
		flushEffects();
		// React's canonical shape: the provider re-runs, the (non-memo!) Wrap
		// indirection is skipped on element identity, the consumer refreshes.
		expect(h.log).toEqual(['provider:1', 'consumer:1']);
		expect(r.find('#c').textContent).toBe('1');
		r.unmount();
	});

	it('cached ARRAY children bail per item; only the consumer re-renders', () => {
		const h = harness();
		function App() {
			return createElement(h.Provider, {
				children: [
					createElement(h.Consumer, { key: 'c' }),
					createElement(h.NonConsumer, { key: 'nc' }),
				],
			});
		}
		const r = mount(App as any);
		flushEffects();
		expect(h.log).toEqual(['provider:0', 'consumer:0', 'non-consumer']);

		h.log.length = 0;
		flushSync(() => h.bumpRef()());
		flushEffects();
		expect(h.log).toEqual(['provider:1', 'consumer:1']);
		expect(r.find('#c').textContent).toBe('1');
		expect(r.find('#nc').textContent).toBe('x');
		r.unmount();
	});

	it('a `return children` passthrough between provider and consumer stays bailed', () => {
		const h = harness();
		// The classic non-memo indirection: its body returns its children element
		// unchanged, so its return slot receives the SAME descriptor every render.
		function Passthrough(props: any) {
			h.log.push('passthrough');
			return props.children;
		}
		function App() {
			return createElement(h.Provider, {
				children: createElement(Passthrough, {
					children: createElement(h.Consumer, {}),
				}),
			});
		}
		const r = mount(App as any);
		flushEffects();
		expect(h.log).toEqual(['provider:0', 'passthrough', 'consumer:0']);

		h.log.length = 0;
		flushSync(() => h.bumpRef()());
		flushEffects();
		expect(h.log).toEqual(['provider:1', 'consumer:1']);
		expect(r.find('#c').textContent).toBe('1');
		r.unmount();
	});

	it('a recreated (non-identical) child element renders normally — no false bail', () => {
		const h = harness();
		function Wrap(props: any) {
			h.log.push('wrap:' + props.label);
			return createElement('div', { children: [String(props.label)] });
		}
		function Parent() {
			const [n, setN] = useState(0, Symbol.for('ieb.parent'));
			h.log.push('parent:' + n);
			return createElement('div', {
				children: [
					createElement('button', { id: 'b', onClick: () => setN(n + 1), children: 'go' }),
					// Fresh element each render → props identity differs → re-render.
					createElement(Wrap, { key: 'w', label: n }),
				],
			});
		}
		const r = mount(Parent as any);
		flushEffects();
		expect(h.log).toEqual(['parent:0', 'wrap:0']);

		h.log.length = 0;
		r.click('#b');
		flushEffects();
		expect(h.log).toEqual(['parent:1', 'wrap:1']);
		r.unmount();
	});

	it('setState INSIDE a bailed subtree still renders it (own scheduling is not severed)', () => {
		const h = harness();
		let innerBump: (() => void) | null = null;
		function Stateful() {
			const [m, setM] = useState(0, Symbol.for('ieb.inner'));
			innerBump = () => setM((x: number) => x + 1);
			h.log.push('stateful:' + m);
			return createElement('span', { id: 's', children: 'm' + m });
		}
		function App() {
			return createElement(h.Provider, {
				children: createElement(Stateful, {}),
			});
		}
		const r = mount(App as any);
		flushEffects();
		expect(h.log).toEqual(['provider:0', 'stateful:0']);

		// Parent provider re-renders → Stateful bails on the cached element.
		h.log.length = 0;
		flushSync(() => h.bumpRef()());
		flushEffects();
		expect(h.log).toEqual(['provider:1']);

		// Its own state update must still render it.
		h.log.length = 0;
		flushSync(() => innerBump!());
		flushEffects();
		expect(h.log).toEqual(['stateful:1']);
		expect(r.find('#s').textContent).toBe('m1');
		r.unmount();
	});
});
