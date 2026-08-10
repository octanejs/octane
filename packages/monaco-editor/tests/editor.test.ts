import loader from '@monaco-editor/loader';
import type { editor } from 'monaco-editor';
import { flushSync } from 'octane';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import Editor, { DiffEditor } from '../src/index';
import type { Monaco, MonacoDiffEditor, MonacoEditor } from '../src/types';
import { flushEffects, mount } from '../../octane/tests/_helpers';
import { createFakeMonaco, FakeCodeEditor } from './_fake-monaco';
import {
	DiffEditorCreationErrorBoundary,
	EditorCreationErrorBoundary,
} from './_fixtures/creation-error.tsrx';

const harness = createFakeMonaco();

async function settle(): Promise<void> {
	flushEffects();
	await Promise.resolve();
	await Promise.resolve();
	flushEffects();
	flushSync(() => {});
	flushEffects();
	// Reason: editor creation marks readiness from a passive effect; drain that render too.
	flushSync(() => {});
	flushEffects();
}

beforeAll(() => {
	loader.config({ monaco: harness.monaco });
});

afterEach(() => {
	vi.restoreAllMocks();
});

afterAll(() => {
	harness.reset();
});

describe('@octanejs/monaco-editor Editor', () => {
	it('creates the editor and synchronizes controlled props and public callbacks', async () => {
		const beforeMount = vi.fn();
		const onMount = vi.fn();
		const onChange = vi.fn();
		const onValidate = vi.fn();
		const setTheme = vi.spyOn(harness.monaco.editor, 'setTheme');
		const createEditor = vi.spyOn(harness.monaco.editor, 'create');
		const overrideServices: editor.IEditorOverrideServices = {};
		let editorInstance: MonacoEditor | undefined;

		const result = mount(Editor as any, {
			path: 'file:///alpha.ts',
			value: 'const alpha = 1;',
			language: 'typescript',
			theme: 'vs-dark',
			line: 3,
			options: { fontSize: 12 },
			overrideServices,
			width: 640,
			height: '80vh',
			className: 'echo-editor',
			wrapperProps: { 'data-testid': 'wrapper' },
			beforeMount,
			onMount: (instance: MonacoEditor, monaco: unknown) => {
				editorInstance = instance;
				onMount(instance, monaco);
			},
			onChange,
			onValidate,
		});
		await settle();

		expect(beforeMount).toHaveBeenCalledOnce();
		expect(onMount).toHaveBeenCalledOnce();
		expect(editorInstance).toBeDefined();
		expect(editorInstance?.getValue()).toBe('const alpha = 1;');
		expect(editorInstance?.getModel()?.getLanguageId()).toBe('typescript');
		expect(createEditor).toHaveBeenCalledWith(
			expect.any(HTMLElement),
			expect.objectContaining({ automaticLayout: true, fontSize: 12 }),
			overrideServices,
		);
		expect(setTheme).toHaveBeenCalledWith('vs-dark');
		expect(result.find('[data-testid="wrapper"]').getAttribute('style')).toContain('width: 640px');
		expect(result.find('.echo-editor')).toBeTruthy();
		expect(result.container.textContent).not.toContain('Loading...');

		editorInstance!.setValue('user edit');
		expect(onChange).toHaveBeenLastCalledWith('user edit', expect.any(Object));

		const model = editorInstance!.getModel()!;
		harness.monaco.editor.setModelMarkers(model, 'owner', [
			{
				message: 'problem',
				severity: 8,
				startLineNumber: 1,
				startColumn: 1,
				endLineNumber: 1,
				endColumn: 2,
			},
		]);
		expect(onValidate).toHaveBeenCalledWith([expect.objectContaining({ message: 'problem' })]);

		onChange.mockClear();
		const nextOnChange = vi.fn();
		const nextOnValidate = vi.fn();
		const updateOptions = vi.spyOn(editorInstance!, 'updateOptions');
		const revealLine = vi.spyOn(editorInstance!, 'revealLine');
		result.update(Editor as any, {
			path: 'file:///alpha.ts',
			value: 'const alpha = 2;',
			language: 'javascript',
			theme: 'light',
			line: 9,
			options: { fontSize: 16, readOnly: false },
			beforeMount,
			onMount,
			onChange: nextOnChange,
			onValidate: nextOnValidate,
		});
		await settle();

		expect(editorInstance!.getValue()).toBe('const alpha = 2;');
		expect(editorInstance!.getModel()?.getLanguageId()).toBe('javascript');
		expect(updateOptions).toHaveBeenCalledWith(expect.objectContaining({ fontSize: 16 }));
		expect(updateOptions).toHaveBeenCalledTimes(1);
		expect(revealLine).toHaveBeenCalledWith(9);
		expect(revealLine).toHaveBeenCalledTimes(1);
		expect(setTheme).toHaveBeenCalledWith('light');
		expect(setTheme).toHaveBeenCalledTimes(2);
		expect(onChange).not.toHaveBeenCalled();
		expect(nextOnChange).not.toHaveBeenCalled();
		expect(beforeMount).toHaveBeenCalledOnce();
		expect(onMount).toHaveBeenCalledOnce();

		editorInstance!.setValue('latest callback');
		expect(onChange).not.toHaveBeenCalled();
		expect(nextOnChange).toHaveBeenCalledWith('latest callback', expect.any(Object));
		harness.monaco.editor.setModelMarkers(editorInstance!.getModel()!, 'owner', [
			{
				message: 'latest problem',
				severity: 8,
				startLineNumber: 1,
				startColumn: 1,
				endLineNumber: 1,
				endColumn: 2,
			},
		]);
		expect(nextOnValidate).toHaveBeenCalledWith([
			expect.objectContaining({ message: 'latest problem' }),
		]);

		result.unmount();
		await settle();
	});

	it('uses default model props for an uncontrolled editor', async () => {
		let editorInstance: MonacoEditor | undefined;
		const result = mount(Editor as any, {
			defaultPath: 'file:///default-model.ts',
			defaultValue: 'default value',
			defaultLanguage: 'markdown',
			onMount: (instance: MonacoEditor) => {
				editorInstance = instance;
			},
		});
		await settle();

		expect(editorInstance!.getModel()?.uri.toString()).toBe('file:///default-model.ts');
		expect(editorInstance!.getValue()).toBe('default value');
		expect(editorInstance!.getModel()?.getLanguageId()).toBe('markdown');
		result.unmount();
		await settle();
	});

	it('invokes onMount after revealing the container and subscribing to content changes', async () => {
		const onChange = vi.fn();
		let displayDuringMount: string | undefined;
		let loadingDuringMount: boolean | undefined;
		const result = mount(Editor as any, {
			defaultValue: 'before mount',
			className: 'mount-ready-editor',
			onChange,
			onMount: (instance: MonacoEditor) => {
				const container = document.querySelector<HTMLElement>('.mount-ready-editor');
				displayDuringMount = container?.style.display;
				loadingDuringMount = container?.parentElement?.textContent?.includes('Loading...');
				instance.setValue('changed during mount');
			},
		});
		await settle();

		expect(displayDuringMount).toBe('');
		expect(loadingDuringMount).toBe(false);
		expect(onChange).toHaveBeenCalledOnce();
		expect(onChange).toHaveBeenCalledWith('changed during mount', expect.any(Object));
		result.unmount();
		await settle();
	});

	it('prefers the controlled language over defaultLanguage for the initial model', async () => {
		let editorInstance: MonacoEditor | undefined;
		const result = mount(Editor as any, {
			language: 'typescript',
			defaultLanguage: 'markdown',
			onMount: (instance: MonacoEditor) => {
				editorInstance = instance;
			},
		});
		await settle();

		expect(editorInstance!.getModel()?.getLanguageId()).toBe('typescript');
		result.unmount();
		await settle();
	});

	it('synchronizes controlled props when mounting onto an existing path model', async () => {
		const existingModel = harness.monaco.editor.createModel(
			'stale value',
			'plaintext',
			harness.monaco.Uri.parse('file:///initial-existing.ts'),
		);
		let editorInstance: MonacoEditor | undefined;
		const result = mount(Editor as any, {
			path: 'file:///initial-existing.ts',
			value: 'controlled value',
			language: 'typescript',
			onMount: (instance: MonacoEditor) => {
				editorInstance = instance;
			},
		});
		await settle();
		await settle();

		expect(editorInstance!.getModel()).toBe(existingModel);
		expect(existingModel.getValue()).toBe('controlled value');
		expect(existingModel.getLanguageId()).toBe('typescript');
		result.unmount();
		await settle();
		expect(existingModel.isDisposed()).toBe(false);
		existingModel.dispose();
	});

	it('switches path models, restores view state, and disposes every owned model', async () => {
		let editorInstance: MonacoEditor | undefined;
		const result = mount(Editor as any, {
			path: 'file:///one.ts',
			value: 'one',
			saveViewState: true,
			onMount: (instance: MonacoEditor) => {
				editorInstance = instance;
			},
		});
		await settle();

		const firstModel = editorInstance!.getModel()!;
		const savedState = {
			cursorState: [],
			viewState: {},
			contributionsState: {},
		} as unknown as editor.ICodeEditorViewState;
		vi.spyOn(editorInstance!, 'saveViewState').mockReturnValue(savedState);
		const restoreViewState = vi.spyOn(editorInstance!, 'restoreViewState');

		result.update(Editor as any, {
			path: 'file:///two.ts',
			value: 'two',
			saveViewState: true,
		});
		await settle();
		const secondModel = editorInstance!.getModel()!;
		expect(secondModel).not.toBe(firstModel);
		expect(secondModel.uri.toString()).toBe('file:///two.ts');

		result.update(Editor as any, {
			path: 'file:///one.ts',
			value: 'one again',
			saveViewState: true,
		});
		await settle();
		expect(editorInstance!.getModel()).toBe(firstModel);
		expect(editorInstance!.getValue()).toBe('one again');
		expect(restoreViewState).toHaveBeenCalledWith(savedState);

		const disposeEditor = vi.spyOn(editorInstance!, 'dispose');
		result.unmount();
		await settle();
		expect(disposeEditor).toHaveBeenCalledOnce();
		expect(firstModel.isDisposed()).toBe(true);
		expect(secondModel.isDisposed()).toBe(true);
	});

	it('restores a kept model view state after unmount and remount', async () => {
		let firstEditor: MonacoEditor | undefined;
		const first = mount(Editor as any, {
			path: 'file:///kept-view-state.ts',
			value: 'kept',
			keepCurrentModel: true,
			saveViewState: true,
			onMount: (instance: MonacoEditor) => {
				firstEditor = instance;
			},
		});
		await settle();

		const keptModel = firstEditor!.getModel()!;
		const savedState = {
			cursorState: [],
			viewState: { scrollTop: 120 },
			contributionsState: {},
		} as unknown as editor.ICodeEditorViewState;
		vi.spyOn(firstEditor!, 'saveViewState').mockReturnValue(savedState);

		first.unmount();
		await settle();
		expect(keptModel.isDisposed()).toBe(false);

		const restoreViewState = vi.spyOn(FakeCodeEditor.prototype, 'restoreViewState');
		let remountedEditor: MonacoEditor | undefined;
		const remounted = mount(Editor as any, {
			path: 'file:///kept-view-state.ts',
			value: 'kept',
			keepCurrentModel: true,
			saveViewState: true,
			onMount: (instance: MonacoEditor) => {
				remountedEditor = instance;
			},
		});
		await settle();

		expect(remountedEditor!.getModel()).toBe(keptModel);
		expect(restoreViewState).toHaveBeenCalledOnce();
		expect(restoreViewState).toHaveBeenCalledWith(savedState);

		remounted.unmount();
		await settle();
		keptModel.dispose();
	});

	it('does not restore view state to a replacement model that reuses a path', async () => {
		let firstEditor: MonacoEditor | undefined;
		const first = mount(Editor as any, {
			path: 'file:///reused-view-state.ts',
			value: 'first generation',
			keepCurrentModel: true,
			saveViewState: true,
			onMount: (instance: MonacoEditor) => {
				firstEditor = instance;
			},
		});
		await settle();

		const firstModel = firstEditor!.getModel()!;
		const firstState = {
			cursorState: [],
			viewState: { scrollTop: 120 },
			contributionsState: {},
		} as unknown as editor.ICodeEditorViewState;
		vi.spyOn(firstEditor!, 'saveViewState').mockReturnValue(firstState);
		first.unmount();
		await settle();
		firstModel.dispose();

		const replacementModel = harness.monaco.editor.createModel(
			'second generation',
			'plaintext',
			harness.monaco.Uri.parse('file:///reused-view-state.ts'),
		);
		const restoreViewState = vi.spyOn(FakeCodeEditor.prototype, 'restoreViewState');
		let replacementEditor: MonacoEditor | undefined;
		const replacement = mount(Editor as any, {
			path: 'file:///reused-view-state.ts',
			keepCurrentModel: true,
			saveViewState: true,
			onMount: (instance: MonacoEditor) => {
				replacementEditor = instance;
			},
		});
		await settle();

		expect(replacementEditor!.getModel()).toBe(replacementModel);
		expect(restoreViewState).not.toHaveBeenCalled();

		replacement.unmount();
		await settle();
		replacementModel.dispose();
	});

	it('isolates kept view states across sibling editor models', async () => {
		let firstEditor: MonacoEditor | undefined;
		let secondEditor: MonacoEditor | undefined;
		const first = mount(Editor as any, {
			path: 'file:///view-state-first.ts',
			value: 'first',
			keepCurrentModel: true,
			saveViewState: true,
			onMount: (instance: MonacoEditor) => {
				firstEditor = instance;
			},
		});
		const second = mount(Editor as any, {
			path: 'file:///view-state-second.ts',
			value: 'second',
			keepCurrentModel: true,
			saveViewState: true,
			onMount: (instance: MonacoEditor) => {
				secondEditor = instance;
			},
		});
		await settle();

		const firstModel = firstEditor!.getModel()!;
		const secondModel = secondEditor!.getModel()!;
		const firstState = {
			cursorState: [],
			viewState: { scrollTop: 10 },
			contributionsState: {},
		} as unknown as editor.ICodeEditorViewState;
		const secondState = {
			cursorState: [],
			viewState: { scrollTop: 20 },
			contributionsState: {},
		} as unknown as editor.ICodeEditorViewState;
		vi.spyOn(firstEditor!, 'saveViewState').mockReturnValue(firstState);
		vi.spyOn(secondEditor!, 'saveViewState').mockReturnValue(secondState);

		first.unmount();
		second.unmount();
		await settle();

		const restoreViewState = vi.spyOn(FakeCodeEditor.prototype, 'restoreViewState');
		let remountedFirstEditor: MonacoEditor | undefined;
		let remountedSecondEditor: MonacoEditor | undefined;
		const remountedSecond = mount(Editor as any, {
			path: 'file:///view-state-second.ts',
			value: 'second',
			keepCurrentModel: true,
			saveViewState: true,
			onMount: (instance: MonacoEditor) => {
				remountedSecondEditor = instance;
			},
		});
		const remountedFirst = mount(Editor as any, {
			path: 'file:///view-state-first.ts',
			value: 'first',
			keepCurrentModel: true,
			saveViewState: true,
			onMount: (instance: MonacoEditor) => {
				remountedFirstEditor = instance;
			},
		});
		await settle();

		expect(remountedFirstEditor!.getModel()).toBe(firstModel);
		expect(remountedSecondEditor!.getModel()).toBe(secondModel);
		expect(restoreViewState).toHaveBeenCalledTimes(2);
		expect(restoreViewState).toHaveBeenNthCalledWith(1, secondState);
		expect(restoreViewState).toHaveBeenNthCalledWith(2, firstState);

		remountedFirst.unmount();
		remountedSecond.unmount();
		await settle();
		firstModel.dispose();
		secondModel.dispose();
	});

	it('skips view-state work when saveViewState is disabled', async () => {
		let editorInstance: MonacoEditor | undefined;
		const result = mount(Editor as any, {
			path: 'file:///no-view-state-one.ts',
			value: 'one',
			saveViewState: false,
			onMount: (instance: MonacoEditor) => {
				editorInstance = instance;
			},
		});
		await settle();

		const saveViewState = vi.spyOn(editorInstance!, 'saveViewState');
		const restoreViewState = vi.spyOn(editorInstance!, 'restoreViewState');
		result.update(Editor as any, {
			path: 'file:///no-view-state-two.ts',
			value: 'two',
			saveViewState: false,
		});
		await settle();
		result.unmount();
		await settle();

		expect(saveViewState).not.toHaveBeenCalled();
		expect(restoreViewState).not.toHaveBeenCalled();
	});

	it('uses setValue for controlled updates on a read-only editor', async () => {
		let editorInstance: MonacoEditor | undefined;
		const result = mount(Editor as any, {
			path: 'file:///read-only.ts',
			value: 'before',
			options: { readOnly: true },
			onMount: (instance: MonacoEditor) => {
				editorInstance = instance;
			},
		});
		await settle();

		const setValue = vi.spyOn(editorInstance!, 'setValue');
		const executeEdits = vi.spyOn(editorInstance!, 'executeEdits');
		result.update(Editor as any, {
			path: 'file:///read-only.ts',
			value: 'after',
			options: { readOnly: true },
		});
		await settle();

		expect(setValue).toHaveBeenCalledWith('after');
		expect(executeEdits).not.toHaveBeenCalled();
		result.unmount();
		await settle();
	});

	it('synchronizes unchanged controlled props into an existing path model without owning it', async () => {
		const existingUri = harness.monaco.Uri.parse('file:///existing.ts');
		const existingModel = harness.monaco.editor.createModel(
			'stale external value',
			'plaintext',
			existingUri,
		);
		let editorInstance: MonacoEditor | undefined;
		const result = mount(Editor as any, {
			path: 'file:///owned.ts',
			value: 'controlled',
			language: 'typescript',
			saveViewState: true,
			onMount: (instance: MonacoEditor) => {
				editorInstance = instance;
			},
		});
		await settle();

		const ownedModel = editorInstance!.getModel()!;
		const savedState = {
			cursorState: [],
			viewState: {},
			contributionsState: {},
		} as unknown as editor.ICodeEditorViewState;
		vi.spyOn(editorInstance!, 'saveViewState').mockReturnValue(savedState);
		const restoreViewState = vi.spyOn(editorInstance!, 'restoreViewState');

		result.update(Editor as any, {
			path: 'file:///existing.ts',
			value: 'controlled',
			language: 'typescript',
			saveViewState: true,
		});
		await settle();
		expect(editorInstance!.getModel()).toBe(existingModel);
		expect(existingModel.getValue()).toBe('controlled');
		expect(existingModel.getLanguageId()).toBe('typescript');

		result.update(Editor as any, {
			path: 'file:///owned.ts',
			value: 'controlled',
			language: 'typescript',
			saveViewState: true,
		});
		await settle();
		expect(restoreViewState).toHaveBeenCalledWith(savedState);

		result.unmount();
		await settle();
		expect(ownedModel.isDisposed()).toBe(true);
		expect(existingModel.isDisposed()).toBe(false);
		existingModel.dispose();
	});

	it('isolates callbacks and model ownership across editor instances', async () => {
		const firstChange = vi.fn();
		const secondChange = vi.fn();
		let firstEditor: MonacoEditor | undefined;
		let secondEditor: MonacoEditor | undefined;
		const first = mount(Editor as any, {
			path: 'file:///first.ts',
			onMount: (instance: MonacoEditor) => {
				firstEditor = instance;
			},
			onChange: firstChange,
		});
		const second = mount(Editor as any, {
			path: 'file:///second.ts',
			onMount: (instance: MonacoEditor) => {
				secondEditor = instance;
			},
			onChange: secondChange,
		});
		await settle();

		firstEditor!.setValue('first edit');
		expect(firstChange).toHaveBeenCalledOnce();
		expect(secondChange).not.toHaveBeenCalled();

		const secondModel = secondEditor!.getModel()!;
		first.unmount();
		await settle();
		expect(secondModel.isDisposed()).toBe(false);
		secondEditor!.setValue('second edit');
		expect(secondChange).toHaveBeenCalledOnce();

		second.unmount();
		await settle();
		expect(secondModel.isDisposed()).toBe(true);
	});

	it('keeps a binding-created shared path model alive until its last editor releases it', async () => {
		let firstEditor: MonacoEditor | undefined;
		let secondEditor: MonacoEditor | undefined;
		const first = mount(Editor as any, {
			path: 'file:///shared.ts',
			value: 'shared',
			onMount: (instance: MonacoEditor) => {
				firstEditor = instance;
			},
		});
		await settle();
		const sharedModel = firstEditor!.getModel()!;

		const second = mount(Editor as any, {
			path: 'file:///shared.ts',
			value: 'shared',
			onMount: (instance: MonacoEditor) => {
				secondEditor = instance;
			},
		});
		await settle();
		expect(secondEditor!.getModel()).toBe(sharedModel);

		first.unmount();
		await settle();
		expect(sharedModel.isDisposed()).toBe(false);
		expect(secondEditor!.getValue()).toBe('shared');

		second.unmount();
		await settle();
		expect(sharedModel.isDisposed()).toBe(true);
	});

	it('keeps shared binding ownership when a non-final lease is preserved', async () => {
		let firstEditor: MonacoEditor | undefined;
		const first = mount(Editor as any, {
			path: 'file:///shared-kept.ts',
			value: 'shared',
			keepCurrentModel: true,
			onMount: (instance: MonacoEditor) => {
				firstEditor = instance;
			},
		});
		await settle();
		const sharedModel = firstEditor!.getModel()!;

		const second = mount(Editor as any, {
			path: 'file:///shared-kept.ts',
			value: 'shared',
		});
		await settle();

		first.unmount();
		await settle();
		expect(sharedModel.isDisposed()).toBe(false);

		second.unmount();
		await settle();
		expect(sharedModel.isDisposed()).toBe(true);
	});

	it('transfers a kept current model out of binding ownership', async () => {
		let editorInstance: MonacoEditor | undefined;
		const result = mount(Editor as any, {
			path: 'file:///kept.ts',
			value: 'keep me',
			keepCurrentModel: true,
			onMount: (instance: MonacoEditor) => {
				editorInstance = instance;
			},
		});
		await settle();
		const keptModel = editorInstance!.getModel()!;

		result.unmount();
		await settle();
		expect(keptModel.isDisposed()).toBe(false);
		keptModel.dispose();
	});

	it('disposes its editor and owned model if onMount throws', async () => {
		const create = harness.monaco.editor.create.bind(harness.monaco.editor);
		let disposeEditor: ReturnType<typeof vi.spyOn> | undefined;
		const createSpy = vi.spyOn(harness.monaco.editor, 'create').mockImplementation((...args) => {
			const instance = create(...args);
			disposeEditor = vi.spyOn(instance, 'dispose');
			return instance;
		});
		let model: editor.ITextModel | undefined;

		const result = mount(EditorCreationErrorBoundary, {
			onMount: (instance: MonacoEditor) => {
				model = instance.getModel() ?? undefined;
				throw new Error('editor mount failed');
			},
		});
		await settle();

		expect(result.find('[data-error]').textContent).toBe('editor mount failed');
		expect(disposeEditor).toHaveBeenCalledOnce();
		expect(model?.isDisposed()).toBe(true);
		createSpy.mockRestore();
		result.unmount();
	});
});

describe('@octanejs/monaco-editor DiffEditor', () => {
	it('synchronizes both models, paths, languages, options, and cleanup flags', async () => {
		let diffEditor: MonacoDiffEditor | undefined;
		const beforeMount = vi.fn();
		const onMount = vi.fn();
		const setTheme = vi.spyOn(harness.monaco.editor, 'setTheme');
		const result = mount(DiffEditor as any, {
			original: 'before',
			modified: 'after',
			originalModelPath: 'file:///before.ts',
			modifiedModelPath: 'file:///after.ts',
			originalLanguage: 'typescript',
			modifiedLanguage: 'javascript',
			options: { readOnly: true },
			beforeMount,
			onMount: (instance: MonacoDiffEditor, monaco: Monaco) => {
				diffEditor = instance;
				onMount(instance, monaco);
			},
		});
		await settle();

		expect(beforeMount).toHaveBeenCalledOnce();
		expect(beforeMount).toHaveBeenCalledWith(harness.monaco);
		expect(onMount).toHaveBeenCalledOnce();
		expect(onMount).toHaveBeenCalledWith(diffEditor, harness.monaco);
		const initialModels = diffEditor!.getModel()!;
		expect(initialModels.original.getValue()).toBe('before');
		expect(initialModels.modified.getValue()).toBe('after');
		expect(initialModels.original.getLanguageId()).toBe('typescript');
		expect(initialModels.modified.getLanguageId()).toBe('javascript');
		const updateOptions = vi.spyOn(diffEditor!, 'updateOptions');

		result.update(DiffEditor as any, {
			original: 'next before',
			modified: 'next after',
			originalModelPath: 'file:///next-before.ts',
			modifiedModelPath: 'file:///next-after.ts',
			language: 'json',
			theme: 'vs-dark',
			options: { renderSideBySide: false },
		});
		await settle();

		const nextModels = diffEditor!.getModel()!;
		expect(nextModels.original).not.toBe(initialModels.original);
		expect(nextModels.modified).not.toBe(initialModels.modified);
		expect(nextModels.original.getValue()).toBe('next before');
		expect(nextModels.modified.getValue()).toBe('next after');
		expect(nextModels.original.getLanguageId()).toBe('json');
		expect(nextModels.modified.getLanguageId()).toBe('json');
		expect(updateOptions).toHaveBeenCalledWith(
			expect.objectContaining({ renderSideBySide: false }),
		);
		expect(updateOptions).toHaveBeenCalledTimes(1);
		expect(setTheme).toHaveBeenCalledWith('vs-dark');
		expect(setTheme).toHaveBeenCalledTimes(2);

		result.unmount();
		await settle();
		expect(initialModels.original.isDisposed()).toBe(true);
		expect(initialModels.modified.isDisposed()).toBe(true);
		expect(nextModels.original.isDisposed()).toBe(true);
		expect(nextModels.modified.isDisposed()).toBe(true);
	});

	it('applies updated options before synchronizing the modified value', async () => {
		let diffEditor: MonacoDiffEditor | undefined;
		const result = mount(DiffEditor as any, {
			modified: 'before',
			options: { readOnly: false },
			onMount: (instance: MonacoDiffEditor) => {
				diffEditor = instance;
			},
		});
		await settle();

		const modifiedEditor = diffEditor!.getModifiedEditor();
		const setValue = vi.spyOn(modifiedEditor, 'setValue');
		const executeEdits = vi.spyOn(modifiedEditor, 'executeEdits');
		result.update(DiffEditor as any, {
			modified: 'after',
			options: { readOnly: true },
		});
		await settle();

		expect(setValue).toHaveBeenCalledWith('after');
		expect(executeEdits).not.toHaveBeenCalled();
		result.unmount();
		await settle();
	});

	it('invokes onMount after revealing the container', async () => {
		let displayDuringMount: string | undefined;
		let loadingDuringMount: boolean | undefined;
		const result = mount(DiffEditor as any, {
			original: 'before',
			modified: 'after',
			className: 'mount-ready-diff-editor',
			onMount: () => {
				const container = document.querySelector<HTMLElement>('.mount-ready-diff-editor');
				displayDuringMount = container?.style.display;
				loadingDuringMount = container?.parentElement?.textContent?.includes('Loading...');
			},
		});
		await settle();

		expect(displayDuringMount).toBe('');
		expect(loadingDuringMount).toBe(false);
		result.unmount();
		await settle();
	});

	it('synchronizes controlled props when mounting onto existing diff models', async () => {
		const originalModel = harness.monaco.editor.createModel(
			'stale original',
			'plaintext',
			harness.monaco.Uri.parse('file:///initial-original.ts'),
		);
		const modifiedModel = harness.monaco.editor.createModel(
			'stale modified',
			'plaintext',
			harness.monaco.Uri.parse('file:///initial-modified.ts'),
		);
		let diffEditor: MonacoDiffEditor | undefined;
		const result = mount(DiffEditor as any, {
			original: 'controlled original',
			modified: 'controlled modified',
			originalLanguage: 'typescript',
			modifiedLanguage: 'javascript',
			originalModelPath: 'file:///initial-original.ts',
			modifiedModelPath: 'file:///initial-modified.ts',
			onMount: (instance: MonacoDiffEditor) => {
				diffEditor = instance;
			},
		});
		await settle();
		await settle();

		expect(diffEditor!.getModel()).toEqual({ original: originalModel, modified: modifiedModel });
		expect(originalModel.getValue()).toBe('controlled original');
		expect(modifiedModel.getValue()).toBe('controlled modified');
		expect(originalModel.getLanguageId()).toBe('typescript');
		expect(modifiedModel.getLanguageId()).toBe('javascript');
		result.unmount();
		await settle();
		expect(originalModel.isDisposed()).toBe(false);
		expect(modifiedModel.isDisposed()).toBe(false);
		originalModel.dispose();
		modifiedModel.dispose();
	});

	it('synchronizes unchanged values and languages when switching to external models', async () => {
		const externalOriginal = harness.monaco.editor.createModel(
			'stale original',
			'plaintext',
			harness.monaco.Uri.parse('file:///external-original.ts'),
		);
		const externalModified = harness.monaco.editor.createModel(
			'stale modified',
			'plaintext',
			harness.monaco.Uri.parse('file:///external-modified.ts'),
		);
		let diffEditor: MonacoDiffEditor | undefined;
		const result = mount(DiffEditor as any, {
			original: 'same original',
			modified: 'same modified',
			language: 'typescript',
			originalModelPath: 'file:///owned-original.ts',
			modifiedModelPath: 'file:///owned-modified.ts',
			onMount: (instance: MonacoDiffEditor) => {
				diffEditor = instance;
			},
		});
		await settle();
		const ownedModels = diffEditor!.getModel()!;

		result.update(DiffEditor as any, {
			original: 'same original',
			modified: 'same modified',
			language: 'typescript',
			originalModelPath: 'file:///external-original.ts',
			modifiedModelPath: 'file:///external-modified.ts',
		});
		await settle();

		expect(diffEditor!.getModel()).toEqual({
			original: externalOriginal,
			modified: externalModified,
		});
		expect(externalOriginal.getValue()).toBe('same original');
		expect(externalModified.getValue()).toBe('same modified');
		expect(externalOriginal.getLanguageId()).toBe('typescript');
		expect(externalModified.getLanguageId()).toBe('typescript');

		result.unmount();
		await settle();
		expect(ownedModels.original.isDisposed()).toBe(true);
		expect(ownedModels.modified.isDisposed()).toBe(true);
		expect(externalOriginal.isDisposed()).toBe(false);
		expect(externalModified.isDisposed()).toBe(false);
		externalOriginal.dispose();
		externalModified.dispose();
	});

	it('preserves only the diff models selected by the keep flags', async () => {
		let diffEditor: MonacoDiffEditor | undefined;
		const result = mount(DiffEditor as any, {
			original: 'keep',
			modified: 'dispose',
			originalModelPath: 'file:///keep-original.ts',
			modifiedModelPath: 'file:///dispose-modified.ts',
			keepCurrentOriginalModel: true,
			keepCurrentModifiedModel: false,
			onMount: (instance: MonacoDiffEditor) => {
				diffEditor = instance;
			},
		});
		await settle();
		const models = diffEditor!.getModel()!;

		result.unmount();
		await settle();
		expect(models.original.isDisposed()).toBe(false);
		expect(models.modified.isDisposed()).toBe(true);
		models.original.dispose();
	});

	it('disposes its editor and owned models if onMount throws', async () => {
		const createDiffEditor = harness.monaco.editor.createDiffEditor.bind(harness.monaco.editor);
		let disposeEditor: ReturnType<typeof vi.spyOn> | undefined;
		const createSpy = vi
			.spyOn(harness.monaco.editor, 'createDiffEditor')
			.mockImplementation((...args) => {
				const instance = createDiffEditor(...args);
				disposeEditor = vi.spyOn(instance, 'dispose');
				return instance;
			});
		let models: editor.IDiffEditorModel | undefined;

		const result = mount(DiffEditorCreationErrorBoundary, {
			onMount: (instance: MonacoDiffEditor) => {
				models = instance.getModel() ?? undefined;
				throw new Error('diff mount failed');
			},
		});
		await settle();

		expect(result.find('[data-error]').textContent).toBe('diff mount failed');
		expect(disposeEditor).toHaveBeenCalledOnce();
		expect(models?.original.isDisposed()).toBe(true);
		expect(models?.modified.isDisposed()).toBe(true);
		createSpy.mockRestore();
		result.unmount();
	});
});
