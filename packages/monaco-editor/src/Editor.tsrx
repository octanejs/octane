import loader from '@monaco-editor/loader';
import type { IDisposable, editor } from 'monaco-editor';
import { memo, useEffect, useRef, useState } from 'octane';

import { Container } from './Container.tsrx';
import { isLoaderCancelation } from './loader';
import { getOrCreateModel, releaseModels } from './model';
import type { EditorProps, Monaco, MonacoEditor } from './types';

const noop = (): void => {};
const EMPTY_OPTIONS: editor.IStandaloneEditorConstructionOptions = {};
const EMPTY_OVERRIDE_SERVICES: editor.IEditorOverrideServices = {};
const EMPTY_WRAPPER_PROPS = {};
// Kept models outlive a component instance, so their view state must as well.
const modelViewStates = new WeakMap<editor.ITextModel, editor.ICodeEditorViewState | null>();

function EditorComponent(props: EditorProps) @{
	const {
		defaultValue,
		defaultLanguage,
		defaultPath,
		value,
		language,
		path,
		theme = 'light',
		line,
		loading = 'Loading...',
		options = EMPTY_OPTIONS,
		overrideServices = EMPTY_OVERRIDE_SERVICES,
		saveViewState = true,
		keepCurrentModel = false,
		width = '100%',
		height = '100%',
		className,
		wrapperProps = EMPTY_WRAPPER_PROPS,
		beforeMount = noop,
		onMount = noop,
		onChange,
		onValidate,
	} = props;

	const [monaco, setMonaco] = useState<Monaco | null>(null);
	const [isEditorReady, setIsEditorReady] = useState(false);
	const editorRef = useRef<MonacoEditor | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const contentSubscriptionRef = useRef<IDisposable | null>(null);
	const markerSubscriptionRef = useRef<IDisposable | null>(null);
	const leasedModelsRef = useRef(new Set<editor.ITextModel>());
	const currentModelKeyRef = useRef<string | undefined>(path ?? defaultPath);
	const preventChangeRef = useRef(false);
	const latestRef = useRef({
		beforeMount,
		keepCurrentModel,
		onChange,
		onMount,
		onValidate,
		saveViewState,
	});

	latestRef.current = {
		beforeMount,
		keepCurrentModel,
		onChange,
		onMount,
		onValidate,
		saveViewState,
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

		let createdEditor: MonacoEditor | null = null;
		try {
			latestRef.current.beforeMount(monaco);
			const initialPath = path ?? defaultPath;
			const initialModel = getOrCreateModel(
				monaco,
				value ?? defaultValue ?? '',
				language ?? defaultLanguage ?? '',
				initialPath,
				leasedModelsRef.current,
			);
			const editorInstance = monaco.editor.create(
				containerRef.current,
				{
					model: initialModel,
					automaticLayout: true,
					...options,
				},
				overrideServices,
			);
			createdEditor = editorInstance;

			editorRef.current = editorInstance;
			currentModelKeyRef.current = initialPath;
			const initialViewState = modelViewStates.get(initialModel);
			if (saveViewState && initialViewState) {
				editorInstance.restoreViewState(initialViewState);
			}
			monaco.editor.setTheme(theme);
			if (line !== undefined) editorInstance.revealLine(line);

			contentSubscriptionRef.current = editorInstance.onDidChangeModelContent((event) => {
				if (!preventChangeRef.current) {
					latestRef.current.onChange?.(editorInstance.getValue(), event);
				}
			});
			markerSubscriptionRef.current = monaco.editor.onDidChangeMarkers((uris) => {
				const editorUri = editorInstance.getModel()?.uri;
				if (editorUri && uris.some((uri) => uri.toString() === editorUri.toString())) {
					latestRef.current.onValidate?.(monaco.editor.getModelMarkers({ resource: editorUri }));
				}
			});
			setIsEditorReady(true);

			return () => {
				if (editorRef.current !== editorInstance) return;

				contentSubscriptionRef.current?.dispose();
				markerSubscriptionRef.current?.dispose();
				contentSubscriptionRef.current = null;
				markerSubscriptionRef.current = null;

				const currentModel = editorInstance.getModel();
				const latest = latestRef.current;
				if (latest.saveViewState && latest.keepCurrentModel && currentModel) {
					modelViewStates.set(currentModel, editorInstance.saveViewState());
				}

				editorInstance.dispose();
				editorRef.current = null;
				const preserved = new Set<editor.ITextModel>();
				if (latest.keepCurrentModel && currentModel) preserved.add(currentModel);
				releaseModels(leasedModelsRef.current, preserved);
			};
		} catch (error) {
			contentSubscriptionRef.current?.dispose();
			markerSubscriptionRef.current?.dispose();
			contentSubscriptionRef.current = null;
			markerSubscriptionRef.current = null;
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
			contentSubscriptionRef.current?.dispose();
			markerSubscriptionRef.current?.dispose();
			contentSubscriptionRef.current = null;
			markerSubscriptionRef.current = null;
			editorInstance.dispose();
			editorRef.current = null;
			releaseModels(leasedModelsRef.current, new Set());
			throw error;
		}
	}, [isEditorReady]);

	useEffect(() => {
		const editorInstance = editorRef.current;
		if (!isEditorReady || !editorInstance || !monaco) return;

		const nextModelKey = path ?? defaultPath;
		if (nextModelKey === currentModelKeyRef.current) return;

		const currentModel = editorInstance.getModel();
		if (saveViewState && currentModel) {
			modelViewStates.set(currentModel, editorInstance.saveViewState());
		}
		const nextModel = getOrCreateModel(
			monaco,
			value ?? defaultValue ?? '',
			language ?? defaultLanguage ?? '',
			nextModelKey,
			leasedModelsRef.current,
		);
		if (nextModel !== currentModel) editorInstance.setModel(nextModel);
		currentModelKeyRef.current = nextModelKey;
		const nextViewState = modelViewStates.get(nextModel);
		if (saveViewState && nextViewState) {
			editorInstance.restoreViewState(nextViewState);
		}
	}, [path]);

	useEffect(() => {
		if (isEditorReady) editorRef.current?.updateOptions(options);
	}, [options]);

	useEffect(() => {
		const editorInstance = editorRef.current;
		if (!isEditorReady || !editorInstance || !monaco || value === undefined) return;
		if (value === editorInstance.getValue()) return;

		preventChangeRef.current = true;
		try {
			if (editorInstance.getOption(monaco.editor.EditorOption.readOnly)) {
				editorInstance.setValue(value);
			} else {
				const model = editorInstance.getModel();
				if (!model) return;
				editorInstance.executeEdits('', [
					{
						range: model.getFullModelRange(),
						text: value,
						forceMoveMarkers: true,
					},
				]);
				editorInstance.pushUndoStop();
			}
		} finally {
			preventChangeRef.current = false;
		}
	}, [isEditorReady, value, path]);

	useEffect(() => {
		const model = editorRef.current?.getModel();
		if (isEditorReady && model && language && monaco) {
			monaco.editor.setModelLanguage(model, language);
		}
	}, [isEditorReady, language, path]);

	useEffect(() => {
		if (isEditorReady && line !== undefined) {
			editorRef.current?.revealLine(line);
		}
	}, [line]);

	useEffect(() => {
		if (isEditorReady && monaco) monaco.editor.setTheme(theme);
	}, [theme]);

	<Container
		width={width}
		height={height}
		isEditorReady={isEditorReady}
		loading={loading}
		containerRef={containerRef}
		className={className}
		wrapperProps={wrapperProps}
	/>
}

export const Editor = memo(EditorComponent);
export default Editor;
