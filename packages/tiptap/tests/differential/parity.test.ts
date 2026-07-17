import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const fixture = resolve(__dirname, '../_fixtures/basic-editor.tsrx');
const cache = resolve(__dirname, '.react-cache');

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
});
