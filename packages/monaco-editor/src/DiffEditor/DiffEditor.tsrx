import loader from '@monaco-editor/loader';
import type { editor } from 'monaco-editor';
import { memo, useEffect, useRef, useState } from 'octane';

import MonacoContainer from '../MonacoContainer';
import { isLoaderCancelation } from '../loader';
import { getOrCreateModel, releaseModels } from '../model';
import type { Monaco } from '../types';
import type { DiffEditorProps, MonacoDiffEditor } from './types';

const noop = (): void => {};
const EMPTY_OPTIONS: editor.IDiffEditorConstructionOptions = {};
const EMPTY_WRAPPER_PROPS = {};

function DiffEditorComponent(props: DiffEditorProps) @{
	const {
		original,
		modified,
		language,
		originalLanguage,
		modifiedLanguage,
		originalModelPath,
		modifiedModelPath,
		keepCurrentOriginalModel = false,
		keepCurrentModifiedModel = false,
		theme = 'light',
		loading = 'Loading...',
		options = EMPTY_OPTIONS,
		height = '100%',
		width = '100%',
		className,
		wrapperProps = EMPTY_WRAPPER_PROPS,
		beforeMount = noop,
		onMount = noop,
	} = props;

	const [monaco, setMonaco] = useState<Monaco | null>(null);
	const [isEditorReady, setIsEditorReady] = useState(false);
	const editorRef = useRef<MonacoDiffEditor | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const leasedModelsRef = useRef(new Set<editor.ITextModel>());
	const currentOriginalPathRef = useRef<string | undefined>(originalModelPath);
	const currentModifiedPathRef = useRef<string | undefined>(modifiedModelPath);
	const latestRef = useRef({
		beforeMount,
		keepCurrentModifiedModel,
		keepCurrentOriginalModel,
		onMount,
	});

	latestRef.current = {
		beforeMount,
		keepCurrentModifiedModel,
		keepCurrentOriginalModel,
		onMount,
	};

	useEffect(() => {
		let active = true;
		const request = loader.init();
		request.then((loadedMonaco) => {
			if (active) setMonaco(loadedMonaco);
		}).catch((error: unknown) => {
			if (active && !isLoaderCancelation(error)) {
				console.error('Monaco initialization: error:', error);
			}
		});

		return () => {
			active = false;
			request.cancel();
		};
	}, []);

	useEffect(() => {
		if (!monaco || !containerRef.current || editorRef.current) return;

		let createdEditor: MonacoDiffEditor | null = null;
		try {
			latestRef.current.beforeMount(monaco);
			const originalModel = getOrCreateModel(
				monaco,
				original ?? '',
				originalLanguage ?? language ?? 'text',
				originalModelPath,
				leasedModelsRef.current,
			);
			const modifiedModel = getOrCreateModel(
				monaco,
				modified ?? '',
				modifiedLanguage ?? language ?? 'text',
				modifiedModelPath,
				leasedModelsRef.current,
			);
			const editorInstance = monaco.editor.createDiffEditor(containerRef.current, {
				automaticLayout: true,
				...options,
			});
			createdEditor = editorInstance;
			editorInstance.setModel({ original: originalModel, modified: modifiedModel });
			editorRef.current = editorInstance;
			currentOriginalPathRef.current = originalModelPath;
			currentModifiedPathRef.current = modifiedModelPath;
			monaco.editor.setTheme(theme);
			setIsEditorReady(true);

			return () => {
				if (editorRef.current !== editorInstance) return;

				const models = editorInstance.getModel();
				editorInstance.dispose();
				editorRef.current = null;

				const preserved = new Set<editor.ITextModel>();
				if (latestRef.current.keepCurrentOriginalModel && models?.original) {
					preserved.add(models.original);
				}
				if (latestRef.current.keepCurrentModifiedModel && models?.modified) {
					preserved.add(models.modified);
				}
				releaseModels(leasedModelsRef.current, preserved);
			};
		} catch (error) {
			createdEditor?.dispose();
			editorRef.current = null;
			releaseModels(leasedModelsRef.current, new Set());
			throw error;
		}
	}, [monaco]);

	useEffect(() => {
		const editorInstance = editorRef.current;
		if (!isEditorReady || !editorInstance || !monaco) return;

		// Reason: readiness must commit first so consumers can focus or measure a visible editor.
		try {
			latestRef.current.onMount(editorInstance, monaco);
		} catch (error) {
			editorInstance.dispose();
			editorRef.current = null;
			releaseModels(leasedModelsRef.current, new Set());
			throw error;
		}
	}, [isEditorReady]);

	useEffect(() => {
		const editorInstance = editorRef.current;
		const currentModels = editorInstance?.getModel();
		if (!isEditorReady || !editorInstance || !currentModels || !monaco) return;

		const nextOriginal =
			originalModelPath === currentOriginalPathRef.current
				? currentModels.original
				: getOrCreateModel(
						monaco,
						original ?? '',
						originalLanguage ?? language ?? 'text',
						originalModelPath,
						leasedModelsRef.current,
					);
		const nextModified =
			modifiedModelPath === currentModifiedPathRef.current
				? currentModels.modified
				: getOrCreateModel(
						monaco,
						modified ?? '',
						modifiedLanguage ?? language ?? 'text',
						modifiedModelPath,
						leasedModelsRef.current,
					);

		if (nextOriginal !== currentModels.original || nextModified !== currentModels.modified) {
			editorInstance.setModel({
				original: nextOriginal,
				modified: nextModified,
			});
		}
		currentOriginalPathRef.current = originalModelPath;
		currentModifiedPathRef.current = modifiedModelPath;
	}, [originalModelPath, modifiedModelPath]);

	useEffect(() => {
		if (isEditorReady) editorRef.current?.updateOptions(options);
	}, [options]);

	useEffect(() => {
		const model = editorRef.current?.getModel()?.original;
		const nextValue = original ?? '';
		if (isEditorReady && model && model.getValue() !== nextValue) {
			model.setValue(nextValue);
		}
	}, [isEditorReady, original, originalModelPath]);

	useEffect(() => {
		const editorInstance = editorRef.current?.getModifiedEditor();
		const nextValue = modified ?? '';
		if (!isEditorReady || !editorInstance || !monaco || editorInstance.getValue() === nextValue) {
			return;
		}

		if (editorInstance.getOption(monaco.editor.EditorOption.readOnly)) {
			editorInstance.setValue(nextValue);
		} else {
			const model = editorInstance.getModel();
			if (!model) return;
			editorInstance.executeEdits('', [
				{
					range: model.getFullModelRange(),
					text: nextValue,
					forceMoveMarkers: true,
				},
			]);
			editorInstance.pushUndoStop();
		}
	}, [isEditorReady, modified, modifiedModelPath]);

	useEffect(() => {
		const models = editorRef.current?.getModel();
		if (!isEditorReady || !models || !monaco) return;
		monaco.editor.setModelLanguage(models.original, originalLanguage ?? language ?? 'text');
		monaco.editor.setModelLanguage(models.modified, modifiedLanguage ?? language ?? 'text');
	}, [
		isEditorReady,
		language,
		originalLanguage,
		modifiedLanguage,
		originalModelPath,
		modifiedModelPath,
	]);

	useEffect(() => {
		if (isEditorReady && monaco) monaco.editor.setTheme(theme);
	}, [theme]);

	<MonacoContainer
		width={width}
		height={height}
		isEditorReady={isEditorReady}
		loading={loading}
		ref={containerRef}
		className={className}
		wrapperProps={wrapperProps}
	/>
}

const DiffEditor = memo(DiffEditorComponent);
export default DiffEditor;
