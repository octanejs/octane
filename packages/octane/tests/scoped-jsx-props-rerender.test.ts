import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { flushSync } from '../src/index.js';
import { mount, type MountResult } from './_helpers.js';
import {
	ScopedPropsOwner,
	type ScopedPropsControls,
} from './_fixtures/scoped-jsx-props-rerender.tsrx';

// An owner passes deferred JSX values (a lone keyed component, a positional
// fragment, a keyed array, an unkeyed array, and a portal body) to a shell that
// re-renders on its own state with the identical values. Every one of the
// shell's renders classifies those values again in its own scope, so keys,
// list positions, context, and portal content must all resolve there.
describe('deferred JSX props across a re-rendering shell', () => {
	let view: MountResult;
	let controls: ScopedPropsControls;
	let warn: MockInstance;

	beforeEach(() => {
		warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		view = mount(ScopedPropsOwner, { bind: (next: ScopedPropsControls) => (controls = next) });
	});
	afterEach(() => {
		view.unmount();
		warn.mockRestore();
	});

	const counter = (label: string): HTMLButtonElement =>
		view.find(`.counter[data-label="${label}"]`) as HTMLButtonElement;
	const texts = (selector: string): string[] =>
		view.findAll(selector).map((node) => node.textContent ?? '');
	const clicks = (label: string, count: number): void => {
		for (let i = 0; i < count; i++) view.click(`.counter[data-label="${label}"]`);
	};
	const keyWarnings = (): number =>
		warn.mock.calls.filter(([message]) => String(message).includes('unique "key"')).length;
	// Identity, not structural equality: a remounted button looks the same.
	const expectSameNodes = (actual: Element[], expected: Element[]): void => {
		expect(actual).toHaveLength(expected.length);
		actual.forEach((node, index) => expect(node).toBe(expected[index]));
	};

	it('keeps every deferred child mounted with its state while the shell re-renders', () => {
		clicks('3.head', 1);
		clicks('3.first', 2);
		clicks('3.a', 1);
		clicks('3.b', 2);
		clicks('3.c', 3);
		clicks('3.x', 1);
		const nodes = view.findAll('.counter');

		flushSync(() => controls.rerenderShell());
		flushSync(() => controls.rerenderShell());

		expectSameNodes(view.findAll('.counter'), nodes);
		expect(texts('.head .counter')).toEqual(['3.head:1']);
		expect(texts('.layers .counter')).toEqual(['3.first:2']);
		expect(texts('.rows .counter')).toEqual(['3.a:1', '3.b:2', '3.c:3']);
		expect(texts('.loose .counter')).toEqual(['3.x:1', '3.y:0']);
		// Only the runtime-built unkeyed array is a missing-key hazard, and its
		// warning is reported once for the shell, not once per re-render.
		expect(keyWarnings()).toBe(1);
	});

	it('refreshes a context consumer inside an identical deferred fragment', () => {
		clicks('3.first', 1);
		const first = counter('3.first');
		expect(texts('.toned')).toEqual(['3.second/plain#0']);

		flushSync(() => controls.rerenderShell());
		expect(texts('.toned')).toEqual(['3.second/plain#1']);

		flushSync(() => controls.setTone('loud'));
		expect(texts('.toned')).toEqual(['3.second/loud#1']);
		expect(counter('3.first')).toBe(first);
		expect(first.textContent).toBe('3.first:1');
	});

	it('moves deferred keyed values by the keys they resolve to', () => {
		clicks('3.a', 1);
		clicks('3.b', 2);
		clicks('3.c', 3);
		const [a, b, c] = ['3.a', '3.b', '3.c'].map(counter);

		flushSync(() => controls.setOrder(['c', 'a', 'b']));
		expect(texts('.rows .counter')).toEqual(['3.c:3', '3.a:1', '3.b:2']);
		expectSameNodes(view.findAll('.rows .counter'), [c, a, b]);

		flushSync(() => controls.rerenderShell());
		expect(texts('.rows .counter')).toEqual(['3.c:3', '3.a:1', '3.b:2']);
		expectSameNodes(view.findAll('.rows .counter'), [c, a, b]);

		flushSync(() => controls.setOrder(['b', 'c']));
		expect(texts('.rows .counter')).toEqual(['2.b:2', '2.c:3']);
		expectSameNodes(view.findAll('.rows .counter'), [b, c]);
	});

	it('remounts a lone deferred component only when its resolved key changes', () => {
		clicks('3.head', 2);
		const head = counter('3.head');

		// A new owner render builds a new deferred value with the same key.
		flushSync(() => controls.setTone('loud'));
		flushSync(() => controls.rerenderShell());
		expect(counter('3.head')).toBe(head);
		expect(head.textContent).toBe('3.head:2');

		flushSync(() => controls.setHeadKey('h2'));
		expect(counter('3.head')).not.toBe(head);
		expect(counter('3.head').textContent).toBe('3.head:0');
	});

	it('mounts, updates, and removes a deferred portal body in place', () => {
		expect(view.findAll('.overlay .tip')).toHaveLength(0);

		flushSync(() => controls.setTip('one'));
		const tip = view.find('.overlay .tip');
		expect(tip.textContent).toBe('one');

		flushSync(() => controls.setTip('two'));
		flushSync(() => controls.rerenderShell());
		expect(view.find('.overlay .tip')).toBe(tip);
		expect(tip.textContent).toBe('two');

		flushSync(() => controls.setTip(null));
		expect(view.findAll('.overlay .tip')).toHaveLength(0);
	});
});
