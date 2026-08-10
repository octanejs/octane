/**
 * Port-authored monaco-editor double for jsdom unit/parity lanes.
 * Real monaco + workers live in tests/browser and examples/monaco-playground.
 */

type Listener = (...args: any[]) => void;

function disposable(fn?: () => void) {
	return { dispose: fn ?? (() => {}) };
}

export type MockModel = {
	uri: { path: string; toString(): string };
	getValue(): string;
	setValue(value: string): void;
	getFullModelRange(): {
		startLineNumber: number;
		startColumn: number;
		endLineNumber: number;
		endColumn: number;
	};
	dispose(): void;
	_disposed: boolean;
	_value: string;
	_language: string;
};

const models = new Map<string, MockModel>();

function createUri(path: string) {
	const normalized =
		typeof path === 'string' && path.length > 0 ? path : `inmemory://model/${models.size + 1}`;
	return {
		path: normalized.startsWith('/') ? normalized : `/${normalized}`,
		toString() {
			return normalized;
		},
	};
}

function createModel(
	value: string,
	language = '',
	uriOrPath?: string | { toString(): string; path?: string },
): MockModel {
	const uri =
		typeof uriOrPath === 'string' || uriOrPath == null
			? createUri(uriOrPath || `model-${models.size + 1}`)
			: {
					path: uriOrPath.path || `/${uriOrPath.toString()}`,
					toString: () => uriOrPath.toString(),
				};
	const key = uri.toString();
	const existing = models.get(key);
	if (existing) return existing;
	const model: MockModel = {
		uri,
		_value: value,
		_language: language,
		_disposed: false,
		getValue() {
			return this._value;
		},
		setValue(next: string) {
			this._value = next;
		},
		getFullModelRange() {
			return {
				startLineNumber: 1,
				startColumn: 1,
				endLineNumber: 1,
				endColumn: this._value.length + 1,
			};
		},
		dispose() {
			this._disposed = true;
			models.delete(key);
		},
	};
	models.set(key, model);
	return model;
}

export type MockEditor = {
	getModel(): MockModel | null;
	setModel(model: MockModel | null): void;
	getValue(): string;
	setValue(value: string): void;
	updateOptions(options: Record<string, unknown>): void;
	getOption(id: number): unknown;
	executeEdits(_source: string, edits: Array<{ text: string; range?: unknown }>): void;
	pushUndoStop(): void;
	revealLine(line: number): void;
	saveViewState(): { scrollTop: number };
	restoreViewState(state: unknown): void;
	onDidChangeModelContent(listener: Listener): { dispose(): void };
	dispose(): void;
	_disposed: boolean;
	_options: Record<string, unknown>;
	_container: HTMLElement;
	_contentListeners: Set<Listener>;
	_model: MockModel | null;
	_theme: string;
	_revealedLine: number | null;
	_restoredViewState: unknown;
	_viewScroll: number;
};

export type MockDiffEditor = {
	getOriginalEditor(): MockEditor;
	getModifiedEditor(): MockEditor;
	getModel(): { original: MockModel; modified: MockModel } | null;
	setModel(models: { original: MockModel; modified: MockModel } | null): void;
	updateOptions(options: Record<string, unknown>): void;
	dispose(): void;
	_disposed: boolean;
	_container: HTMLElement;
	_original: MockEditor;
	_modified: MockEditor;
};

const createdEditors: MockEditor[] = [];
const createdDiffEditors: MockDiffEditor[] = [];

function createStandaloneEditor(
	container: HTMLElement,
	options: Record<string, unknown> = {},
): MockEditor {
	const contentListeners = new Set<Listener>();
	const editor: MockEditor = {
		_disposed: false,
		_options: { ...options },
		_container: container,
		_contentListeners: contentListeners,
		_model: (options.model as MockModel) ?? null,
		_theme: 'light',
		_revealedLine: null,
		_restoredViewState: null,
		_viewScroll: 0,
		getModel() {
			return this._model;
		},
		setModel(model) {
			this._model = model;
		},
		getValue() {
			return this._model?.getValue() ?? '';
		},
		setValue(value) {
			this._model?.setValue(value);
		},
		updateOptions(next) {
			this._options = { ...this._options, ...next };
		},
		getOption(id) {
			if (id === EditorOption.readOnly) return Boolean(this._options.readOnly);
			return undefined;
		},
		executeEdits(_source, edits) {
			const text = edits[0]?.text ?? '';
			this._model?.setValue(text);
			for (const listener of contentListeners) listener({ changes: [] });
		},
		pushUndoStop() {},
		revealLine(line) {
			this._revealedLine = line;
		},
		saveViewState() {
			this._viewScroll += 1;
			return { scrollTop: this._viewScroll };
		},
		restoreViewState(state) {
			this._restoredViewState = state;
		},
		onDidChangeModelContent(listener) {
			contentListeners.add(listener);
			return disposable(() => contentListeners.delete(listener));
		},
		dispose() {
			this._disposed = true;
			contentListeners.clear();
		},
	};
	createdEditors.push(editor);
	container.setAttribute('data-monaco-ready', 'true');
	return editor;
}

function createDiffEditor(
	container: HTMLElement,
	options: Record<string, unknown> = {},
): MockDiffEditor {
	const original = createStandaloneEditor(container, options);
	const modified = createStandaloneEditor(container, options);
	const diff: MockDiffEditor = {
		_disposed: false,
		_container: container,
		_original: original,
		_modified: modified,
		getOriginalEditor() {
			return this._original;
		},
		getModifiedEditor() {
			return this._modified;
		},
		getModel() {
			const o = this._original.getModel();
			const m = this._modified.getModel();
			if (!o || !m) return null;
			return { original: o, modified: m };
		},
		setModel(next) {
			this._original.setModel(next?.original ?? null);
			this._modified.setModel(next?.modified ?? null);
		},
		updateOptions(next) {
			this._original.updateOptions(next);
			this._modified.updateOptions(next);
		},
		dispose() {
			this._disposed = true;
			this._original.dispose();
			this._modified.dispose();
		},
	};
	createdDiffEditors.push(diff);
	container.setAttribute('data-monaco-diff-ready', 'true');
	return diff;
}

export const EditorOption = {
	readOnly: 90,
};

const markerListeners = new Set<Listener>();
const markersByResource = new Map<string, unknown[]>();
let currentTheme = 'light';

export const monaco = {
	Uri: {
		parse(path: string) {
			return createUri(path);
		},
	},
	editor: {
		EditorOption,
		create: createStandaloneEditor,
		createDiffEditor,
		createModel,
		getModel(uri: { toString(): string }) {
			return models.get(uri.toString()) ?? null;
		},
		setModelLanguage(model: MockModel, language: string) {
			model._language = language;
		},
		setTheme(theme: string) {
			currentTheme = theme;
		},
		onDidChangeMarkers(listener: Listener) {
			markerListeners.add(listener);
			return disposable(() => markerListeners.delete(listener));
		},
		getModelMarkers(filter?: { resource?: { toString(): string } }) {
			if (!filter?.resource) return [] as unknown[];
			return markersByResource.get(filter.resource.toString()) ?? [];
		},
		defineTheme() {},
	},
	__reset() {
		models.clear();
		createdEditors.length = 0;
		createdDiffEditors.length = 0;
		markerListeners.clear();
		markersByResource.clear();
		currentTheme = 'light';
	},
	__editors: createdEditors,
	__diffEditors: createdDiffEditors,
	__getTheme() {
		return currentTheme;
	},
	__setMarkers(uri: { toString(): string; path?: string }, markers: unknown[]) {
		markersByResource.set(uri.toString(), markers);
	},
	__emitMarkers(uris: Array<{ path: string; toString?: () => string }>) {
		for (const listener of markerListeners) listener(uris);
	},
};

export type Monaco = typeof monaco;

export default monaco;
