import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { mountDifferential } from '../../../octane/tests/differential/_rig.js';
import { flushEffects } from '../_helpers';

const fixture = resolve(__dirname, '../_fixtures/basic-editor.tsrx');
const customViewsFixture = resolve(__dirname, '../_fixtures/custom-views-parity.tsrx');
const cache = resolve(__dirname, '.react-cache');

async function waitForPublishedSelection(...mounts: { container: HTMLElement }[]): Promise<void> {
	for (let frame = 0; frame < 10; frame++) {
		if (
			mounts.every(
				({ container }) =>
					container.querySelector('[data-parity-node-selection]')?.textContent === 'selected',
			)
		) {
			return;
		}
		await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
	}

	throw new Error('node selection was not published within 10 animation frames');
}

describe('differential: @octanejs/tiptap vs @tiptap/react', () => {
	it('renders and updates a StarterKit editor identically', async () => {
		const editors: any[] = [];
		const differential = await mountDifferential(
			fixture,
			'BasicEditor',
			{ onEditor: (editor: any) => editors.push(editor) },
			cache,
		);

		await differential.step('mount with initial content', () => {});
		expect(new Set(editors).size).toBe(2);
		expect(differential.octane.container.querySelector('output')?.textContent).toBe('Hello TipTap');
		expect(differential.react.container.querySelector('output')?.textContent).toBe('Hello TipTap');

		await differential.step(
			'replace the document through the editor API',
			async (octane, react) => {
				await octane.click('#replace-content');
				await react.click('#replace-content');
			},
		);
		expect(differential.octane.container.querySelector('output')?.textContent).toBe(
			'Shared update',
		);
		expect(differential.react.container.querySelector('output')?.textContent).toBe('Shared update');

		differential.unmount();
	});

	it('matches renderer, node-view, and mark-view behavior through their visible lifecycles', async () => {
		const lifecycle: string[] = [];
		const differential = await mountDifferential(
			customViewsFixture,
			'CustomViewsParity',
			{
				onLifecycle: (phase: string) => lifecycle.push(phase),
			},
			cache,
		);

		await differential.step('mount custom node and mark portals with inherited context', () => {});
		flushEffects();
		for (const mounted of [differential.octane, differential.react]) {
			expect(mounted.find('[data-parity-node-theme]').textContent).toBe('day');
			expect(mounted.find('[data-parity-node-label]').textContent).toBe('initial');
			expect(mounted.find('[data-parity-node-selection]').textContent).toBe('unselected');
			expect(mounted.find('[data-parity-node-content]').textContent).toBe('Editable panel');
			expect(mounted.find('[data-parity-mark-theme]').textContent).toBe('day');
			expect(mounted.find('[data-parity-mark-tone]').textContent).toBe('warm');
			expect(mounted.find('[data-mark-view-content]').textContent).toBe('Marked text');
		}
		expect(lifecycle).toEqual(['node:mount', 'node:mount']);

		await differential.step(
			'preserve node state while updating its attributes',
			async (octane, react) => {
				await octane.click('[data-parity-node-increment]');
				await react.click('[data-parity-node-increment]');
				await octane.click('[data-parity-node-update]');
				await react.click('[data-parity-node-update]');
			},
		);
		for (const mounted of [differential.octane, differential.react]) {
			expect(mounted.find('[data-parity-node-increment]').textContent).toBe('node:1');
			expect(mounted.find('[data-parity-node-label]').textContent).toBe('updated');
			expect(
				mounted.find('[data-parity-panel-label]').getAttribute('data-parity-panel-label'),
			).toBe('updated');
		}
		expect(lifecycle).toEqual(['node:mount', 'node:mount']);

		await differential.step('publish node selection', async (octane, react) => {
			await octane.click('[data-parity-node-select]');
			await react.click('[data-parity-node-select]');
			await waitForPublishedSelection(octane, react);
		});
		for (const mounted of [differential.octane, differential.react]) {
			expect(mounted.find('[data-parity-node-selection]').textContent).toBe('selected');
			expect(mounted.find('.parity-panel-renderer').classList).toContain(
				'ProseMirror-selectednode',
			);
		}

		await differential.step(
			'mount and update a direct renderer without losing state',
			async (octane, react) => {
				await octane.click('[data-parity-renderer-create]');
				await react.click('[data-parity-renderer-create]');
				await octane.click('[data-parity-renderer-increment]');
				await react.click('[data-parity-renderer-increment]');
				await octane.click('[data-parity-renderer-update]');
				await react.click('[data-parity-renderer-update]');
			},
		);
		for (const mounted of [differential.octane, differential.react]) {
			expect(mounted.find('[data-parity-renderer-theme]').textContent).toBe('day');
			expect(mounted.find('[data-parity-renderer-label]').textContent).toBe('updated');
			expect(mounted.find('[data-parity-renderer-increment]').textContent).toBe('renderer:1');
		}
		flushEffects();
		expect(lifecycle).toEqual(['node:mount', 'node:mount', 'renderer:mount', 'renderer:mount']);

		await differential.step(
			'flow a context update through every live portal',
			async (octane, react) => {
				await octane.click('[data-parity-theme-toggle]');
				await react.click('[data-parity-theme-toggle]');
			},
		);
		for (const mounted of [differential.octane, differential.react]) {
			expect(mounted.find('[data-parity-node-theme]').textContent).toBe('night');
			expect(mounted.find('[data-parity-mark-theme]').textContent).toBe('night');
			expect(mounted.find('[data-parity-renderer-theme]').textContent).toBe('night');
		}

		await differential.step(
			'replace the mark view after an attribute update',
			async (octane, react) => {
				await octane.click('[data-parity-mark-update]');
				await react.click('[data-parity-mark-update]');
			},
		);
		for (const mounted of [differential.octane, differential.react]) {
			expect(mounted.find('[data-parity-mark-tone]').textContent).toBe('cool');
			expect(mounted.find('[data-mark-view-content]').textContent).toBe('Marked text');
		}
		await differential.step(
			'remove the mark portal while retaining its text',
			async (octane, react) => {
				await octane.click('[data-parity-mark-remove]');
				await react.click('[data-parity-mark-remove]');
			},
		);
		for (const mounted of [differential.octane, differential.react]) {
			expect(mounted.container.querySelector('[data-parity-mark-view]')).toBe(null);
			expect(mounted.find('[data-parity-editor-text]').textContent).toContain('Marked text');
		}

		await differential.step(
			'destroy the direct renderer and run its cleanup',
			async (octane, react) => {
				await octane.click('[data-parity-renderer-destroy]');
				await react.click('[data-parity-renderer-destroy]');
			},
		);
		for (const mounted of [differential.octane, differential.react]) {
			expect(mounted.container.querySelector('[data-parity-renderer-view]')).toBe(null);
		}
		flushEffects();
		expect(lifecycle).toEqual([
			'node:mount',
			'node:mount',
			'renderer:mount',
			'renderer:mount',
			'renderer:cleanup',
			'renderer:cleanup',
		]);

		await differential.step('delete the node view and run its cleanup', async (octane, react) => {
			await octane.click('[data-parity-node-delete]');
			await react.click('[data-parity-node-delete]');
		});
		for (const mounted of [differential.octane, differential.react]) {
			expect(mounted.container.querySelector('[data-parity-node-view]')).toBe(null);
			expect(mounted.find('[data-parity-editor-text]').textContent).toBe('Marked text tail');
		}
		flushEffects();
		expect(lifecycle).toEqual([
			'node:mount',
			'node:mount',
			'renderer:mount',
			'renderer:mount',
			'renderer:cleanup',
			'renderer:cleanup',
			'node:cleanup',
			'node:cleanup',
		]);

		differential.unmount();
	});
});
