import { flushSync, hydrateRoot } from 'octane';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createSignal } from '@octanejs/alien-signals';
import { flushEffects } from './_helpers';
import { renderHydrationFixture } from '../../octane/tests/_hydration-ssr';
import { ServerSignalView, ServerSignalFeatures } from './_fixtures/hooks.tsrx';

const source = createSignal(7);
const entries: string[] = [];
const props = {
	source,
	log: (entry: string) => {
		entries.push(entry);
	},
};
let serverHtml: string;
let featureHtml: string;
const featureSource = createSignal(7);
const featureEntries: string[] = [];
const featureProps = { source: featureSource, log: (entry: string) => featureEntries.push(entry) };

beforeAll(async () => {
	serverHtml = (
		await renderHydrationFixture(
			'alien-signals',
			'packages/alien-signals/tests/_fixtures/hooks.tsrx',
			'ServerSignalView',
			props,
		)
	).html;
	featureHtml = (
		await renderHydrationFixture(
			'alien-signals',
			'packages/alien-signals/tests/_fixtures/hooks.tsrx',
			'ServerSignalFeatures',
			featureProps,
		)
	).html;
});

async function settle(): Promise<void> {
	for (let index = 0; index < 3; index += 1) {
		flushEffects();
		flushSync(() => {});
		await Promise.resolve();
	}
}

describe('@octanejs/alien-signals hydration', () => {
	// @parity-case native:alien-signals-lifecycle-f1a1cd48ef54b3ad
	it('adopts server markup, starts client lifecycle work, and remains reactive', async () => {
		expect(entries).toEqual([]);

		const container = document.createElement('div');
		container.innerHTML = serverHtml;
		document.body.appendChild(container);
		const serverParagraph = container.querySelector('#server-signal');
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: ReturnType<typeof hydrateRoot> | undefined;

		try {
			root = hydrateRoot(container, ServerSignalView, props);
			await settle();

			expect(container.querySelector('#server-signal')).toBe(serverParagraph);
			expect(entries).toEqual(['effect', 'scope']);
			expect(errors).not.toHaveBeenCalled();

			source(8);
			await settle();
			expect(serverParagraph?.textContent).toBe('8');
			expect(errors).not.toHaveBeenCalled();
		} finally {
			root?.unmount();
			errors.mockRestore();
			container.remove();
		}
	});
});

// @parity-case native:alien-signals-lifecycle-12ecc7dbcbaf9efe
it('hydrates selected and deferred snapshots and owns each phase cleanup', async () => {
	expect(featureEntries).toEqual([]);
	const container = document.createElement('div');
	container.innerHTML = featureHtml;
	document.body.appendChild(container);
	const serverOutputs = [...container.querySelectorAll('output')];
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	let root: ReturnType<typeof hydrateRoot> | undefined;
	try {
		root = hydrateRoot(container, ServerSignalFeatures, featureProps);
		await settle();
		expect([...container.querySelectorAll('output')]).toEqual(serverOutputs);
		expect(serverOutputs.map((node) => node.textContent)).toEqual(['7', '14', '7']);
		expect(featureEntries).toEqual(['insertion:7', 'layout:7', 'passive:7']);
		featureSource(8);
		await vi.waitFor(async () => {
			await settle();
			expect(serverOutputs.map((node) => node.textContent)).toEqual(['8', '16', '8']);
		});
		for (const phase of ['insertion', 'layout', 'passive']) {
			expect(featureEntries.filter((entry) => entry === phase + ':8')).toHaveLength(1);
			expect(featureEntries.filter((entry) => entry === phase + ':cleanup')).toHaveLength(1);
		}
		root.unmount();
		root = undefined;
		for (const phase of ['insertion', 'layout', 'passive']) {
			expect(featureEntries.filter((entry) => entry === phase + ':cleanup')).toHaveLength(2);
		}
		const stopped = featureEntries.slice();
		featureSource(9);
		await settle();
		expect(featureEntries).toEqual(stopped);
		expect(errors).not.toHaveBeenCalled();
	} finally {
		root?.unmount();
		errors.mockRestore();
		container.remove();
	}
});
