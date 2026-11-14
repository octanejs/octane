import { describe, it, expect } from 'vitest';
import { attachRef } from '../src/index.js';
import { mount } from './_helpers';
import { ActivityIdentityRef, IdentityRef } from './_fixtures/ref-identity.tsrx';

describe('callback ref identity change (React 19 detach-before-attach)', () => {
	it('swapping the callback runs the old cleanup-return before attaching the new', () => {
		const log: string[] = [];
		const a = (el: any) => {
			log.push(el ? 'A:attach' : 'A:null');
			return () => log.push('A:cleanup');
		};
		const b = (el: any) => {
			log.push(el ? 'B:attach' : 'B:null');
			return () => log.push('B:cleanup');
		};

		const r = mount(IdentityRef, { pick: a });
		expect(log).toEqual(['A:attach']);

		r.update(IdentityRef, { pick: b });
		expect(log).toEqual(['A:attach', 'A:cleanup', 'B:attach']);

		r.unmount();
		expect(log).toEqual(['A:attach', 'A:cleanup', 'B:attach', 'B:cleanup']);
	});

	it('a legacy callback (no cleanup) gets null when its identity changes', () => {
		const log: string[] = [];
		const a = (el: any) => log.push(el ? 'A:attach' : 'A:null');
		const b = (el: any) => log.push(el ? 'B:attach' : 'B:null');

		const r = mount(IdentityRef, { pick: a });
		r.update(IdentityRef, { pick: b });
		expect(log).toEqual(['A:attach', 'A:null', 'B:attach']);
		r.unmount();
		expect(log).toEqual(['A:attach', 'A:null', 'B:attach', 'B:null']);
	});

	it('replacing a callback ref with null detaches it (runs cleanup), once', () => {
		const log: string[] = [];
		const a = (el: any) => {
			log.push(el ? 'A:attach' : 'A:null');
			return () => log.push('A:cleanup');
		};

		const r = mount(IdentityRef, { pick: a });
		expect(log).toEqual(['A:attach']);

		r.update(IdentityRef, { pick: null });
		expect(log).toEqual(['A:attach', 'A:cleanup']);

		// No double-detach on unmount — it was already detached.
		r.unmount();
		expect(log).toEqual(['A:attach', 'A:cleanup']);
	});

	it('a stable callback ref is not re-invoked across renders', () => {
		const log: string[] = [];
		const a = (el: any) => {
			log.push(el ? 'A:attach' : 'A:null');
			return () => log.push('A:cleanup');
		};
		const r = mount(IdentityRef, { pick: a });
		r.update(IdentityRef, { pick: a }); // same identity
		r.update(IdentityRef, { pick: a });
		expect(log).toEqual(['A:attach']); // not re-fired
		r.unmount();
		expect(log).toEqual(['A:attach', 'A:cleanup']);
	});

	it('preserves array/object refs when their callbacks are replaced, removed, and restored', () => {
		const log: string[] = [];
		const firstObject: { current: Element | null } = { current: null };
		const secondObject: { current: Element | null } = { current: null };
		const first = (element: Element | null) => {
			if (element !== null) log.push('first:attach');
			return () => log.push('first:cleanup');
		};
		const second = (element: Element | null) => {
			if (element !== null) log.push('second:attach');
			return () => log.push('second:cleanup');
		};
		const firstRefs = [firstObject, first];
		const secondRefs = [secondObject, second];
		const root = mount(IdentityRef, { pick: firstRefs });
		const host = root.find('#host');

		expect(firstObject.current).toBe(host);
		expect(log).toEqual(['first:attach']);
		root.update(IdentityRef, { pick: firstRefs });
		expect(log).toEqual(['first:attach']);

		root.update(IdentityRef, { pick: secondRefs });
		expect(firstObject.current).toBeNull();
		expect(secondObject.current).toBe(host);
		expect(log).toEqual(['first:attach', 'first:cleanup', 'second:attach']);

		root.update(IdentityRef, { pick: null });
		expect(secondObject.current).toBeNull();
		expect(log).toEqual(['first:attach', 'first:cleanup', 'second:attach', 'second:cleanup']);

		root.update(IdentityRef, { pick: firstRefs });
		expect(firstObject.current).toBe(host);
		expect(log.at(-1)).toBe('first:attach');
		root.unmount();
		expect(firstObject.current).toBeNull();
		expect(log.at(-1)).toBe('first:cleanup');
	});

	it('cleans up every occurrence of a callback in a nested array ref', () => {
		const log: string[] = [];
		let calls = 0;
		const callback = (element: Element | null) => {
			if (element === null) {
				log.push('null');
				return;
			}
			const call = ++calls;
			log.push(`attach ${call}`);
			if (call !== 2) return () => log.push(`cleanup ${call}`);
		};
		const root = mount(IdentityRef, { pick: [callback, [callback, callback]] });

		root.update(IdentityRef, { pick: null });
		expect(log).toEqual(['attach 1', 'attach 2', 'attach 3', 'cleanup 1', 'null', 'cleanup 3']);
		root.unmount();
		expect(log).toHaveLength(6);
	});

	it('reconnects each duplicate array ref occurrence after Activity reveals', () => {
		const log: string[] = [];
		let calls = 0;
		const callback = (element: Element | null) => {
			if (element === null) {
				log.push('null');
				return;
			}
			const call = ++calls;
			log.push(`attach ${call}`);
			return () => log.push(`cleanup ${call}`);
		};
		const pick = [callback, callback];
		const root = mount(ActivityIdentityRef, { mode: 'visible', pick });
		const host = root.find('#host');

		root.update(ActivityIdentityRef, { mode: 'hidden', pick });
		expect(log).toEqual(['attach 1', 'attach 2', 'cleanup 1', 'cleanup 2']);
		root.update(ActivityIdentityRef, { mode: 'visible', pick });
		expect(root.find('#host')).toBe(host);
		root.unmount();
		expect(log.slice(4)).toEqual(['attach 3', 'attach 4', 'cleanup 3', 'cleanup 4']);
	});

	it('cleans up the leaves originally attached even if the array changes', () => {
		const log: string[] = [];
		const refs = [() => () => log.push('original cleanup')];
		const root = mount(IdentityRef, { pick: refs });
		refs[0] = () => {
			log.push('replacement called');
			return () => {};
		};
		root.unmount();
		expect(log).toEqual(['original cleanup']);
	});

	it('finishes the active array callback when it detaches its own ref', () => {
		const log: string[] = [];
		const element = document.createElement('div');
		const refs = [
			() => {
				log.push('first attach');
				attachRef(refs, null, element);
				return () => log.push('first cleanup');
			},
			() => log.push('second called'),
		];

		attachRef(refs, element);
		expect(log).toEqual(['first attach', 'first cleanup']);
	});

	it('uses the most recent array attachment for a targetless detach', () => {
		const cleanups: Element[] = [];
		const callback = (element: Element | null) => {
			expect(element).not.toBeNull();
			return () => cleanups.push(element!);
		};
		const refs = [callback, callback];
		const a = document.createElement('div');
		const b = document.createElement('div');
		attachRef(refs, a);
		attachRef(refs, b);

		attachRef(refs, null);
		expect(cleanups).toEqual([b, b]);
		attachRef(refs, null, a);
		expect(cleanups).toEqual([b, b, a, a]);
	});
});
