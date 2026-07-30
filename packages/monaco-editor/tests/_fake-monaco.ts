import type { editor, IDisposable, Uri } from 'monaco-editor';

import type { Monaco } from '../src/types';

class FakeUri {
	readonly path: string;

	constructor(readonly value: string) {
		this.path = value;
	}

	toString(): string {
		return this.value;
	}
}

export class FakeModel {
	private disposed = false;
	private value: string;
	private language: string;

	constructor(
		value: string,
		language: string | undefined,
		readonly uri: Uri,
		private readonly onDispose: () => void,
	) {
		this.value = value;
		this.language = language ?? 'plaintext';
	}

	getValue(): string {
		return this.value;
	}

	setValue(value: string): void {
		this.value = value;
	}

	getLanguageId(): string {
		return this.language;
	}

	setLanguage(language: string): void {
		this.language = language;
	}

	getFullModelRange(): editor.IRange {
		return {
			startLineNumber: 1,
			startColumn: 1,
			endLineNumber: 1,
			endColumn: this.value.length + 1,
		};
	}

	isDisposed(): boolean {
		return this.disposed;
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.onDispose();
	}
}

const CHANGE_EVENT = {
	changes: [],
	eol: '\n',
	isFlush: false,
	isRedoing: false,
	isUndoing: false,
	versionId: 1,
	isEolChange: false,
} as unknown as editor.IModelContentChangedEvent;

export class FakeCodeEditor {
	private model: FakeModel | null;
	private options: Record<string, unknown>;
	private readonly changeListeners = new Set<(event: editor.IModelContentChangedEvent) => void>();
	private viewState: editor.ICodeEditorViewState | null = null;

	constructor(model: FakeModel | null, options: Record<string, unknown> = {}) {
		this.model = model;
		this.options = { ...options };
	}

	getModel(): FakeModel | null {
		return this.model;
	}

	setModel(model: editor.ITextModel | null): void {
		this.model = model as FakeModel | null;
	}

	getValue(): string {
		return this.model?.getValue() ?? '';
	}

	setValue(value: string): void {
		this.model?.setValue(value);
		this.emitChange();
	}

	executeEdits(_source: string, edits: editor.IIdentifiedSingleEditOperation[]): boolean {
		this.model?.setValue(edits.at(-1)?.text ?? '');
		this.emitChange();
		return true;
	}

	pushUndoStop(): boolean {
		return true;
	}

	getOption<T extends editor.EditorOption>(
		_option: T,
	): editor.FindComputedEditorOptionValueById<T> {
		return Boolean(this.options.readOnly) as editor.FindComputedEditorOptionValueById<T>;
	}

	updateOptions(options: editor.IEditorOptions & editor.IGlobalEditorOptions): void {
		Object.assign(this.options, options);
	}

	getRawOptions(): Record<string, unknown> {
		return { ...this.options };
	}

	onDidChangeModelContent(
		listener: (event: editor.IModelContentChangedEvent) => void,
	): IDisposable {
		this.changeListeners.add(listener);
		return {
			dispose: () => this.changeListeners.delete(listener),
		};
	}

	saveViewState(): editor.ICodeEditorViewState | null {
		return this.viewState;
	}

	restoreViewState(state: editor.ICodeEditorViewState | null): void {
		this.viewState = state;
	}

	revealLine(_line: number): void {}

	dispose(): void {
		this.changeListeners.clear();
	}

	private emitChange(): void {
		for (const listener of this.changeListeners) listener(CHANGE_EVENT);
	}
}

export class FakeDiffEditor {
	private models: editor.IDiffEditorModel | null = null;
	private readonly originalEditor: FakeCodeEditor;
	private readonly modifiedEditor: FakeCodeEditor;
	private options: Record<string, unknown>;

	constructor(options: Record<string, unknown>) {
		this.options = { ...options };
		this.originalEditor = new FakeCodeEditor(null, options);
		this.modifiedEditor = new FakeCodeEditor(null, options);
	}

	setModel(models: editor.IDiffEditorModel | null): void {
		this.models = models;
		this.originalEditor.setModel(models?.original ?? null);
		this.modifiedEditor.setModel(models?.modified ?? null);
	}

	getModel(): editor.IDiffEditorModel | null {
		return this.models;
	}

	getOriginalEditor(): FakeCodeEditor {
		return this.originalEditor;
	}

	getModifiedEditor(): FakeCodeEditor {
		return this.modifiedEditor;
	}

	updateOptions(options: editor.IDiffEditorOptions): void {
		Object.assign(this.options, options);
		this.originalEditor.updateOptions(options);
		this.modifiedEditor.updateOptions(options);
	}

	dispose(): void {
		this.originalEditor.dispose();
		this.modifiedEditor.dispose();
	}
}

export interface FakeMonacoHarness {
	monaco: Monaco;
	reset(): void;
}

export function createFakeMonaco(): FakeMonacoHarness {
	const models = new Map<string, FakeModel>();
	const markerListeners = new Set<(uris: readonly Uri[]) => void>();
	const markers = new Map<string, editor.IMarker[]>();
	let anonymousModelId = 0;

	const editorApi = {
		EditorOption: { readOnly: 91 },
		createModel(value: string, language?: string, uri?: Uri) {
			const modelUri =
				uri ?? (new FakeUri(`inmemory://model/${++anonymousModelId}`) as unknown as Uri);
			const key = modelUri.toString();
			const model = new FakeModel(value, language, modelUri, () => models.delete(key));
			models.set(key, model);
			return model as unknown as editor.ITextModel;
		},
		getModel(uri: Uri) {
			return (models.get(uri.toString()) ?? null) as editor.ITextModel | null;
		},
		create(_container: HTMLElement, options: editor.IStandaloneEditorConstructionOptions) {
			return new FakeCodeEditor(
				(options.model as FakeModel | undefined) ?? null,
				options as Record<string, unknown>,
			) as unknown as editor.IStandaloneCodeEditor;
		},
		createDiffEditor(
			_container: HTMLElement,
			options: editor.IStandaloneDiffEditorConstructionOptions,
		) {
			return new FakeDiffEditor(
				options as Record<string, unknown>,
			) as unknown as editor.IStandaloneDiffEditor;
		},
		setModelLanguage(model: editor.ITextModel, language: string) {
			(model as unknown as FakeModel).setLanguage(language);
		},
		setTheme(_theme: string) {},
		onDidChangeMarkers(listener: (uris: readonly Uri[]) => void): IDisposable {
			markerListeners.add(listener);
			return { dispose: () => markerListeners.delete(listener) };
		},
		getModelMarkers(filter: { resource?: Uri }) {
			return filter.resource ? (markers.get(filter.resource.toString()) ?? []) : [];
		},
		setModelMarkers(model: editor.ITextModel, _owner: string, nextMarkers: editor.IMarkerData[]) {
			const fullMarkers = nextMarkers.map((marker, index) => ({
				...marker,
				owner: 'test',
				resource: model.uri,
				relatedInformation: undefined,
				tags: undefined,
				code: undefined,
				source: undefined,
				message: marker.message,
				severity: marker.severity,
				startLineNumber: marker.startLineNumber,
				startColumn: marker.startColumn,
				endLineNumber: marker.endLineNumber,
				endColumn: marker.endColumn,
				index,
			})) as unknown as editor.IMarker[];
			markers.set(model.uri.toString(), fullMarkers);
			for (const listener of markerListeners) listener([model.uri]);
		},
	};

	const monaco = {
		Uri: {
			parse(value: string) {
				return new FakeUri(value) as unknown as Uri;
			},
		},
		editor: editorApi,
	} as unknown as Monaco;

	return {
		monaco,
		reset() {
			for (const model of [...models.values()]) model.dispose();
			markers.clear();
			markerListeners.clear();
			anonymousModelId = 0;
		},
	};
}
