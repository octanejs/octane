import { describe, expect, it, vi } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers.js';
import { DynamicIcon } from '@octanejs/lucide/dynamic';
import type { LucideIconData } from '@octanejs/lucide';

const loads = vi.hoisted(() => ({ camera: vi.fn(), search: vi.fn() }));
vi.mock('../src/dynamicIconImports', () => ({ default: loads }));

function deferred() {
	let resolve!: (module: { __iconData: LucideIconData }) => void;
	const promise = new Promise<{ __iconData: LucideIconData }>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe('@octanejs/lucide — dynamic icon lifecycle', () => {
	it('keeps the latest requested icon when an older import finishes later', async () => {
		const camera = deferred();
		const search = deferred();
		loads.camera.mockReturnValue(camera.promise);
		loads.search.mockReturnValue(search.promise);
		const mounted = mount(DynamicIcon, { name: 'camera' });
		await act(() => {});
		mounted.update(DynamicIcon, { name: 'search' });
		await act(() => {});
		await act(async () => search.resolve({ __iconData: { name: 'search', node: [] } }));
		expect(mounted.find('svg').classList.contains('lucide-search')).toBe(true);
		await act(async () => camera.resolve({ __iconData: { name: 'camera', node: [] } }));
		expect(mounted.find('svg').classList.contains('lucide-search')).toBe(true);
		mounted.unmount();
	});
});
