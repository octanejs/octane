import { describe, expect, it, vi } from 'vitest';
import {
	COMPILED_OUTPUT_PATH,
	OCTANE_OUTPUT_SCHEME,
	registerOctaneResultViewer,
} from '../src/result-viewer.cjs';

function createVscode() {
	let provider;
	const fire = vi.fn();
	const outputUri = {
		path: COMPILED_OUTPUT_PATH,
		scheme: OCTANE_OUTPUT_SCHEME,
		toString: () => `${OCTANE_OUTPUT_SCHEME}:${COMPILED_OUTPUT_PATH}`,
	};
	const document = { languageId: 'plaintext', uri: outputUri };
	const vscode = {
		EventEmitter: class EventEmitter {
			event = Symbol('event');
			fire = fire;
			dispose = vi.fn();
		},
		languages: {
			setTextDocumentLanguage: vi.fn(async (value, languageId) => ({ ...value, languageId })),
		},
		Uri: {
			from: vi.fn(() => outputUri),
		},
		window: {
			showTextDocument: vi.fn(),
		},
		workspace: {
			openTextDocument: vi.fn(async () => document),
			registerTextDocumentContentProvider: vi.fn((_scheme, value) => {
				provider = value;
				return { dispose: vi.fn() };
			}),
		},
	};
	return { document, fire, provider: () => provider, vscode };
}

describe('Octane compiled output viewer', () => {
	it('updates one read-only JavaScript document instead of creating temp files', async () => {
		const mock = createVscode();
		const context = { subscriptions: [] };
		const viewer = registerOctaneResultViewer(mock.vscode, context);

		expect(mock.vscode.workspace.registerTextDocumentContentProvider).toHaveBeenCalledWith(
			OCTANE_OUTPUT_SCHEME,
			expect.any(Object),
		);
		expect(context.subscriptions).toHaveLength(2);

		await viewer.showCompiledCode('const first = 1;');
		expect(mock.provider().provideTextDocumentContent(viewer.outputUri)).toBe('const first = 1;');
		expect(mock.vscode.languages.setTextDocumentLanguage).toHaveBeenCalledWith(
			mock.document,
			'javascript',
		);
		expect(mock.vscode.window.showTextDocument).toHaveBeenCalledWith(
			expect.objectContaining({ languageId: 'javascript' }),
			{ preview: false },
		);

		await viewer.showCompiledCode('const second = 2;');
		expect(mock.provider().provideTextDocumentContent(viewer.outputUri)).toBe('const second = 2;');
		expect(mock.vscode.workspace.openTextDocument).toHaveBeenNthCalledWith(1, viewer.outputUri);
		expect(mock.vscode.workspace.openTextDocument).toHaveBeenNthCalledWith(2, viewer.outputUri);
		expect(mock.fire).toHaveBeenCalledTimes(2);
		expect(mock.fire).toHaveBeenLastCalledWith(viewer.outputUri);
	});
});
