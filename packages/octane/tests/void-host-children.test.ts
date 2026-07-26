import { it, expect } from 'vitest';
import { flushSync } from '../src/index.js';
import { mount } from './_helpers';
import {
	VoidArrayChild,
	VoidChildLater,
	VoidComponentChild,
	fillHole,
} from './_fixtures/void-host-child.tsx';

// A void element has no content model, so rendering any content into one is an
// authoring error rather than something to silently drop. Templates are rejected
// at compile time; these cover the runtime arm, where the child value is only
// known while rendering.

it('rejects a component child inside a void host', () => {
	expect(() => mount(VoidComponentChild)).toThrow(/void element/);
});

it('rejects an array of children inside a void host', () => {
	expect(() => mount(VoidArrayChild)).toThrow(/void element/);
});

it('rejects a child that appears inside a void host on a later render', () => {
	// An absent child legitimately coexists with a void host, so the rejection
	// cannot be a mount-time-only check.
	const r = mount(VoidChildLater);
	expect((r.find('#vl') as HTMLElement).childNodes.length).toBe(0);
	expect(() => flushSync(fillHole)).toThrow(/void element/);
	r.unmount();
});
