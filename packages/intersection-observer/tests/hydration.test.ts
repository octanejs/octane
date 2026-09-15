import { flushSync, hydrateRoot } from 'octane';
import { beforeAll, expect, it, vi } from 'vitest';
import { renderHydrationFixture } from '../../octane/tests/_hydration-ssr';
import {
	destroyIntersectionMocking,
	intersectionMockInstance,
	mockIsIntersecting,
	setupIntersectionMocking,
} from '@octanejs/intersection-observer/test-utils';
import { HookProbe } from './_fixtures/probes.tsrx';

const onChange = vi.fn();
const props = { initialInView: true, onChange };
let html: string;

beforeAll(async () => {
	html = (
		await renderHydrationFixture(
			'intersection-observer',
			'packages/intersection-observer/tests/_fixtures/probes.tsrx',
			'HookProbe',
			props,
		)
	).html;
}, 30_000);

// @parity-case native:intersection-observer-144a7592ea2cd7bc
it('adopts server visibility, starts observation on the client, and disconnects on unmount', () => {
	expect(onChange).not.toHaveBeenCalled();
	setupIntersectionMocking(vi.fn);
	const container = document.createElement('div');
	container.innerHTML = html;
	document.body.append(container);
	const target = container.querySelector('[data-testid="target"]')!;
	expect(target.textContent?.trim()).toBe('visible');
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	let root: ReturnType<typeof hydrateRoot> | undefined;
	try {
		flushSync(() => {
			root = hydrateRoot(container, HookProbe, props);
		});
		expect(container.querySelector('[data-testid="target"]')).toBe(target);
		const observer = intersectionMockInstance(target);
		flushSync(() => mockIsIntersecting(target, false));
		expect(target.textContent?.trim()).toBe('hidden');
		expect(onChange).toHaveBeenCalledExactlyOnceWith(false, expect.objectContaining({ target }));
		root!.unmount();
		root = undefined;
		expect(observer.unobserve).toHaveBeenCalledExactlyOnceWith(target);
		expect(observer.disconnect).toHaveBeenCalledOnce();
		expect(errors).not.toHaveBeenCalled();
	} finally {
		root?.unmount();
		errors.mockRestore();
		destroyIntersectionMocking();
		container.remove();
	}
});
