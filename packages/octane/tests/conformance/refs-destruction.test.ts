/**
 * Refs are detached when their subtree is destroyed — ported from
 * facebook/react packages/react-dom/src/__tests__/refs-destruction-test.js
 * (React 19.2.7). The class-instance ref is adapted to a function child
 * forwarding its ref to a host element (React 19 ref-as-prop).
 *
 * Out of scope:
 *   - :121 'should not error when destroying child with ref asynchronously' —
 *     built on class lifecycles (componentDidMount/WillUnmount driving a
 *     nested root through setTimeout); octane has no class components and the
 *     nested-root teardown it exercises is covered by portal/root tests.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '../_helpers';
import { flushSync } from '../../src/index.js';
import { TestComponent } from './_fixtures/refs-destruction.tsrx';

type Ref = { current: Element | null };
const ref = (): Ref => ({ current: null });

describe('refs-destruction', () => {
	it('should remove refs when destroying the parent', () => {
		// Per refs-destruction-test.js:69 — root unmount nulls both the host ref
		// and the (forwarded) component ref.
		const divRef = ref();
		const childRef = ref();
		const m = mount(TestComponent as any, { divRef, childRef });

		expect(divRef.current).toBeInstanceOf(Element);
		expect(childRef.current).toBeInstanceOf(Element);

		m.unmount();
		expect(divRef.current).toBe(null);
		expect(childRef.current).toBe(null);
	});

	it('should remove refs when destroying the child', () => {
		// Per refs-destruction-test.js:85 — replacing the subtree that holds the
		// ref'd elements nulls both refs.
		const divRef = ref();
		const childRef = ref();
		const m = mount(TestComponent as any, { divRef, childRef });

		expect(divRef.current).toBeInstanceOf(Element);
		expect(childRef.current).toBeInstanceOf(Element);

		m.root.render(TestComponent as any, { divRef, childRef, destroy: true });
		flushSync(() => {});
		expect(divRef.current).toBe(null);
		expect(childRef.current).toBe(null);
		m.unmount();
	});

	it('should remove refs when removing the child ref attribute', () => {
		// Per refs-destruction-test.js:103 — the elements stay mounted; only the
		// ref bindings go away. Refs must detach WITHOUT the elements rebuilding.
		const divRef = ref();
		const childRef = ref();
		const m = mount(TestComponent as any, { divRef, childRef });

		const innerDiv = m.container.querySelector('#inner-div');
		expect(divRef.current).toBe(innerDiv);
		expect(childRef.current).toBeInstanceOf(Element);

		m.root.render(TestComponent as any, { divRef, childRef, removeRef: true });
		flushSync(() => {});
		expect(divRef.current).toBe(null);
		expect(childRef.current).toBe(null);
		// Same elements, not rebuilt — only the bindings detached.
		expect(m.container.querySelector('#inner-div')).toBe(innerDiv);
		m.unmount();
	});
});
