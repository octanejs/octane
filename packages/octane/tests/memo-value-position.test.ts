import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from './_helpers';
import {
	createContext,
	createElement,
	flushSync,
	memo,
	useContext,
	useState,
} from '../src/index.js';

// Regression: React.memo's bail lived only in componentSlot (compiled component
// positions) — a memo()'d component rendered as VALUE-POSITION children (provider
// children, `.ts` binding trees via createElement) re-rendered unconditionally, and
// the context-refresh walk missed consumers under a childSlot in ARRAY mode (the
// keyed list lives in an embedded forSlot). Real-world: Radix NavigationMenu's
// convergence relies on React's implicit same-element bailout; the explicit octane
// expression is a memo() pass-through, which silently didn't bail.
const Ctx = createContext<number>(0);
const log: string[] = [];
let bumpFn: ((u: (v: number) => number) => void) | null = null;

const MemoChildren = memo(function MemoChildren(props: any) {
	log.push('memo-body');
	return props.children;
});

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
	const [n, bump] = useState(0, Symbol.for('mvp.n'));
	bumpFn = bump;
	log.push('provider:' + n);
	return createElement(Ctx.Provider, {
		value: n,
		children: createElement(MemoChildren, { children: props.children }),
	});
}

function App() {
	return createElement(Provider, {
		children: [createElement(Consumer, { key: 'c' }), createElement(NonConsumer, { key: 'nc' })],
	});
}

describe('memo at value position (provider children)', () => {
	it('bails on stable children; refreshes ONLY changed-context consumers (React lazy propagation)', () => {
		const r = mount(App as any);
		flushEffects();
		expect(log).toEqual(['provider:0', 'memo-body', 'consumer:0', 'non-consumer']);

		log.length = 0;
		flushSync(() => bumpFn!((x) => x + 1));
		flushEffects();
		// React's canonical ['App','Consumer'] — no 'Indirection', no non-consumer.
		expect(log).toEqual(['provider:1', 'consumer:1']);
		expect(r.find('#c').textContent).toBe('1');
		expect(r.find('#nc').textContent).toBe('x'); // untouched but alive
		r.unmount();
	});
});
