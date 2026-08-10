/**
 * Same fixtures through @octanejs/monaco-editor and pinned
 * @monaco-editor/react@4.7.0 on React 19.2.7, against the shared loader mock.
 *
 * Lifecycle create/dispose is covered by port-authored runtime tests with the
 * monaco double. The published React bundle's async loader.init path does not
 * reliably finish editor.create under jsdom with that double, so this lane pins
 * the consumer-visible loading / pending markup both implementations emit on
 * first paint via the differential rig's full normalized DOM `step`.
 */
import { describe, it, beforeEach } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.ts';
import loader from '../_mocks/loader';

const EDITOR_FIXTURE = resolve(__dirname, '../_fixtures/differential/editor-diff.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

beforeEach(() => {
	loader.__reset();
});

describe('differential: @octanejs/monaco-editor vs @monaco-editor/react 4.7.0', () => {
	// @parity-case differential:f7ceb1f1e6
	it('renders matching Editor loading shells before monaco resolves', async () => {
		// Hold loader.init so step cannot race the microtask that would flip
		// either side past the loading shell under a busy schedule.
		loader.__reset({ holdInit: true });
		const differential = await mountDifferential(
			EDITOR_FIXTURE,
			'EditorDiff',
			{ defaultValue: 'parity', defaultLanguage: 'javascript' },
			CACHE,
		);

		await differential.step('initial loading shell', () => {});

		differential.unmount();
		loader.__reset();
	});

	// @parity-case differential:6c933659aa
	it('renders matching DiffEditor loading shells', async () => {
		loader.__reset({ holdInit: true });
		const differential = await mountDifferential(
			EDITOR_FIXTURE,
			'DiffEditorDiff',
			{ original: 'a', modified: 'b', language: 'plaintext' },
			CACHE,
		);

		await differential.step('diff loading shell', () => {});

		differential.unmount();
		loader.__reset();
	});

	// @parity-case differential:0211495295
	it('renders matching useMonaco pending markup before init', async () => {
		loader.__reset({ holdInit: true });
		const differential = await mountDifferential(EDITOR_FIXTURE, 'UseMonacoDiff', {}, CACHE);
		await differential.step('useMonaco pending', () => {});
		differential.unmount();
		// Drop held init resolvers without settling — unmount already canceled the
		// promises, and useMonaco only attaches a fulfillment handler.
		loader.__reset();
	});
});
