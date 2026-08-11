// Adapted ports of React's Context.Consumer scenarios (ReactNewContext-test.js,
// ReactContextPropagation-test.js, ReactSuspense-test.internal.js). Octane has
// no render-prop Consumer — the modern callable context plus slot-keyed hooks
// is the supported model (decision recorded in issue #711) — so every consumer
// here reads via useContext/use and the tests assert the same observable
// outcomes the upstream cases protect. Accessing `.Consumer` is covered last:
// it warns once per context in development and stays `undefined`, so feature
// probes behave exactly as in production.
import { describe, it, expect, vi } from 'vitest';
import { act, createContext } from '../../src/index.js';
import * as Server from 'octane/server';
import { mount } from '../_helpers';
import {
	DefaultOutside,
	Branches,
	PropagationBail,
	Siblings,
	HiddenHost,
	NoBailouts,
	SuspendedHost,
	setSink,
} from '../_fixtures/context-consumer-adapted.tsrx';

describe('context consumers, adapted (no render-prop Consumer)', () => {
	// Per ReactNewContext-test.js:343 — 'should provide the correct (default)
	// values to consumers outside of a provider'
	it('a reader outside every provider sees the default value', () => {
		const r = mount(DefaultOutside, {});
		expect(r.find('.r-out').textContent).toBe('default');
		r.unmount();
	});

	// Per ReactNewContext-test.js:381 — 'multiple consumers in different branches'
	it('readers in different branches all track the provider value', () => {
		const r = mount(Branches, { value: 'a' });
		expect(r.find('.r-b1').textContent).toBe('a');
		expect(r.find('.r-b2').textContent).toBe('a');
		r.update(Branches, { value: 'b' });
		expect(r.find('.r-b1').textContent).toBe('b');
		expect(r.find('.r-b2').textContent).toBe('b');
		r.unmount();
	});

	// Per ReactContextPropagation-test.js:299 — 'context consumer bails out if
	// context hasn't changed'
	it('a same-value provider re-commit does not re-render the reader', () => {
		const log: string[] = [];
		setSink((s) => log.push(s));
		const r = mount(PropagationBail, { value: 'x' });
		expect(log).toEqual(['Root', 'Shell', 'Reader:p:x']);
		log.length = 0;
		r.update(PropagationBail, { value: 'x' });
		expect(log).toEqual(['Root']); // memo shell AND reader both bailed
		log.length = 0;
		r.update(PropagationBail, { value: 'y' });
		// Propagation reaches the reader without re-rendering the bailed shell.
		expect(log).toEqual(['Root', 'Reader:p:y']);
		expect(r.find('.r-p').textContent).toBe('y');
		r.unmount();
		setSink(null);
	});

	// Per ReactContextPropagation-test.js:892 — 'finds context consumers in
	// multiple sibling branches'
	it('a context change reaches readers in every sibling branch', () => {
		const log: string[] = [];
		setSink((s) => log.push(s));
		const r = mount(Siblings, { value: 'one' });
		log.length = 0;
		r.update(Siblings, { value: 'two' });
		// All three readers re-ran; none of the bailed memo shells did.
		expect(log).toEqual(['Reader:s1:two', 'Reader:s2:two', 'Reader:s3:two']);
		expect(r.find('.r-s1').textContent).toBe('two');
		expect(r.find('.r-s2').textContent).toBe('two');
		expect(r.find('.r-s3').textContent).toBe('two');
		r.unmount();
		setSink(null);
	});

	// Per ReactNewContext-test.js:706 — "context consumer doesn't bail out
	// inside hidden subtree"
	it('a context change updates a reader inside a hidden Activity subtree', () => {
		const r = mount(HiddenHost, { value: 'v1', mode: 'visible' });
		expect(r.find('.r-hidden').textContent).toBe('v1');
		r.update(HiddenHost, { value: 'v1', mode: 'hidden' });
		const hidden = r.find('.r-hidden') as HTMLElement;
		expect(hidden.style.display).toBe('none');
		// Update the context WHILE hidden: the hidden reader must not bail.
		r.update(HiddenHost, { value: 'v2', mode: 'hidden' });
		expect(r.find('.r-hidden').textContent).toBe('v2');
		r.update(HiddenHost, { value: 'v2', mode: 'visible' });
		expect((r.find('.r-hidden') as HTMLElement).style.display).toBe('');
		expect(r.find('.r-hidden').textContent).toBe('v2');
		r.unmount();
	});

	// Per ReactNewContext-test.js:1135 — 'consumer does not bail out if there
	// were no bailouts above it'
	it('a memo-free chain re-renders through to the reader on every change', () => {
		const log: string[] = [];
		setSink((s) => log.push(s));
		const r = mount(NoBailouts, { value: 'p' });
		expect(log).toEqual(['NB', 'Middle', 'Plain:p']);
		log.length = 0;
		r.update(NoBailouts, { value: 'q' });
		// No memo boundary above the reader: the whole chain re-runs.
		expect(log).toEqual(['NB', 'Middle', 'Plain:q']);
		expect(r.find('.plain').textContent).toBe('q');
		r.unmount();
		setSink(null);
	});

	// Per ReactSuspense-test.internal.js:1410 — 'updates context consumer within
	// child of suspended suspense component when context updates'
	it('a context update while suspended reaches the reader on reveal', async () => {
		let resolve!: (v: string) => void;
		const promise = new Promise<string>((res) => {
			resolve = res;
		});
		const r = mount(SuspendedHost, { value: 'before', promise });
		expect(r.container.textContent).toContain('waiting');
		// Context updates while the boundary is still held on the fallback.
		r.update(SuspendedHost, { value: 'after', promise });
		expect(r.container.textContent).toContain('waiting');
		await act(async () => {
			resolve('data');
			await promise;
		});
		expect(r.find('.sus').textContent).toBe('data');
		// The revealed reader observes the latest context, not the mount value.
		expect(r.find('.r-sus').textContent).toBe('after');
		r.unmount();
	});
});

describe('Context.Consumer access diagnostic', () => {
	it('client: accessing .Consumer warns once per context and returns undefined', () => {
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const Ctx = createContext(0);
			expect((Ctx as any).Consumer).toBeUndefined();
			expect((Ctx as any).Consumer).toBeUndefined();
			const warns = errSpy.mock.calls.filter((c) => String(c[0]).includes('no Context.Consumer'));
			expect(warns).toHaveLength(1);
			// A second context warns independently.
			const Other = createContext(1);
			expect((Other as any).Consumer).toBeUndefined();
			expect(
				errSpy.mock.calls.filter((c) => String(c[0]).includes('no Context.Consumer')),
			).toHaveLength(2);
		} finally {
			errSpy.mockRestore();
		}
	});

	it('server: the same diagnostic exists on octane/server contexts', () => {
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const Ctx = Server.createContext(0);
			expect((Ctx as any).Consumer).toBeUndefined();
			expect(
				errSpy.mock.calls.filter((c) => String(c[0]).includes('no Context.Consumer')),
			).toHaveLength(1);
		} finally {
			errSpy.mockRestore();
		}
	});
});
