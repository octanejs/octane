import { describe, expect, it } from 'vitest';
import { flushSync } from '../src/index.js';
import { mount } from './_helpers.js';
import { Owner } from './_fixtures/scoped-jsx-prop-identity.tsx';

// A component's children resolve lazily, in the scope they render in. That
// deferral must not cost the owner's identities: props an owner wrote once stay
// the same objects until the owner itself renders again. Effect and memo deps
// are built on those identities, so a rebuild that re-creates them re-runs
// effects forever when one of them writes state back into the same provider.
describe('scoped JSX child props', () => {
	function setup() {
		const seen: Array<() => void> = [];
		let bump = (): void => {};
		let bumpUnrelated = (): void => {};
		(globalThis as any).__SCOPED_OWNER_RENDERS = { n: 0 };
		const result = mount(Owner, {
			seen,
			bind: (fn: () => void) => (bump = fn),
			bindUnrelated: (fn: () => void) => (bumpUnrelated = fn),
		});
		return { seen, result, bump: () => bump(), bumpUnrelated: () => bumpUnrelated() };
	}

	it('keeps a callback prop identity across an update of the context its sibling reads', () => {
		const { seen, result, bump } = setup();
		flushSync(bump);
		flushSync(bump);

		expect((globalThis as any).__SCOPED_OWNER_RENDERS.n).toBe(1);
		expect(seen.length).toBeGreaterThan(2);
		for (const cb of seen) expect(cb).toBe(seen[0]);
		result.unmount();
	});

	it('keeps a callback prop identity across an unrelated provider update', () => {
		const { seen, result, bumpUnrelated } = setup();
		flushSync(bumpUnrelated);
		flushSync(bumpUnrelated);

		for (const cb of seen) expect(cb).toBe(seen[0]);
		result.unmount();
	});

	it('still refreshes a prop that reads the updated context lazily', () => {
		const { result, bump } = setup();
		expect(result.find('[data-role="lazy"]').textContent).toBe('0');

		flushSync(bump);
		expect(result.find('[data-role="lazy"]').textContent).toBe('1');

		flushSync(bump);
		expect(result.find('[data-role="lazy"]').textContent).toBe('2');
		result.unmount();
	});
});
