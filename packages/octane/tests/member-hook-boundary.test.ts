/**
 * A component that calls a hook owns that hook's state, so an update the hook
 * schedules re-renders that component — not its parent and not its siblings.
 *
 * The contract must not depend on how the hook is spelled at the call site. A
 * custom hook carried on an object (`route.useLoaderData()`,
 * `api.useGetThingQuery()`, `SomeContext.useSelector(fn)`) is the shape a large
 * part of the React ecosystem exposes, and it has to behave exactly like the
 * same hook called as a bare identifier.
 */
import { describe, expect, it } from 'vitest';
import { act, mount, nextPaint } from './_helpers';
import {
	IdentifierParent,
	MemberParent,
	bumpFirst,
	log,
	resetFixture,
} from './_fixtures/member-hook-boundary.tsrx';

async function renderThenBump(parent: typeof MemberParent) {
	resetFixture();
	const result = mount(parent);
	await nextPaint();
	log.length = 0;
	act(() => {
		bumpFirst();
	});
	await nextPaint();
	return result;
}

describe('component update boundary for custom hooks', () => {
	it('re-renders only the component whose identifier-form hook updated', async () => {
		const result = await renderThenBump(IdentifierParent);

		expect(log).toEqual(['IdentifierHookChild:1']);
		expect(result.find('#identifier').textContent).toBe('1');

		result.unmount();
	});

	it('re-renders only the component whose member-form hook updated', async () => {
		const result = await renderThenBump(MemberParent);

		// Before the lite-eligibility fix this produced
		// ['MemberParent', 'MemberHookChild:1', 'HooklessSibling'] — the child was
		// classified hookless, mounted through the lite path with no block of its
		// own, so its hook state landed on the parent and updating it re-rendered
		// the whole subtree.
		expect(log).toEqual(['MemberHookChild:1']);
		expect(result.find('#member').textContent).toBe('1');

		result.unmount();
	});
});
