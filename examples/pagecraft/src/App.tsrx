import { LexicalComposer } from '@octanejs/lexical/LexicalComposer';
import { ContentEditable } from '@octanejs/lexical/LexicalContentEditable';
import { LexicalErrorBoundary } from '@octanejs/lexical/LexicalErrorBoundary';
import { HistoryPlugin } from '@octanejs/lexical/LexicalHistoryPlugin';
import { ListPlugin } from '@octanejs/lexical/LexicalListPlugin';
import { OnChangePlugin } from '@octanejs/lexical/LexicalOnChangePlugin';
import { RichTextPlugin } from '@octanejs/lexical/LexicalRichTextPlugin';
import { useLexicalComposerContext } from '@octanejs/lexical/LexicalComposerContext';
import { $setBlocksType } from '@lexical/selection';
import { $createHeadingNode, $isHeadingNode } from '@lexical/rich-text';
import {
	$createParagraphNode,
	$getRoot,
	$getSelection,
	$isRangeSelection,
	CAN_REDO_COMMAND,
	CAN_UNDO_COMMAND,
	COMMAND_PRIORITY_LOW,
	FORMAT_TEXT_COMMAND,
	mergeRegister,
	REDO_COMMAND,
	SELECTION_CHANGE_COMMAND,
	UNDO_COMMAND,
} from 'lexical';
import { useEffect, useRef, useState } from 'octane';
import { loadDocument, loadDocuments, saveDocument } from './api';
import { PAGECRAFT_NODES } from './nodes';
import { documentURL, readRoute } from './router';
import { pagecraftTheme } from './theme';
import type { PageDocument } from './types';

function EditorPlaceholder() {
	return <div class="editor-placeholder">Start with a thought, a question, or a title…</div>;
}

function ToolbarButton(props) {
	return <button
		type="button"
		class={props.active ? 'toolbar-button is-active' : 'toolbar-button'}
		disabled={props.disabled}
		aria-label={props.label}
		aria-pressed={props.pressed}
		title={props.label}
		onMouseDown={(event) => event.preventDefault()}
		onClick={props.onClick}
	>{props.children}</button>;
}

function EditorToolbar() {
	const [editor] = useLexicalComposerContext();
	const [canUndo, setCanUndo] = useState(false);
	const [canRedo, setCanRedo] = useState(false);
	const [blockType, setBlockType] = useState('paragraph');
	const [bold, setBold] = useState(false);
	const [italic, setItalic] = useState(false);
	const [underline, setUnderline] = useState(false);

	const updateToolbar = () => {
		const selection = $getSelection();
		if (!$isRangeSelection(selection)) return;
		setBold(selection.hasFormat('bold'));
		setItalic(selection.hasFormat('italic'));
		setUnderline(selection.hasFormat('underline'));
		const anchor = selection.anchor.getNode();
		const element =
			anchor.getKey() === 'root' ? anchor : anchor.getTopLevelElementOrThrow();
		setBlockType($isHeadingNode(element) ? element.getTag() : element.getType());
	};

	useEffect(() => {
		editor.getEditorState().read(updateToolbar);
		return mergeRegister(
			editor.registerUpdateListener(({ editorState }) => editorState.read(updateToolbar)),
			editor.registerCommand(
				SELECTION_CHANGE_COMMAND,
				() => {
					updateToolbar();
					return false;
				},
				COMMAND_PRIORITY_LOW,
			),
			editor.registerCommand(
				CAN_UNDO_COMMAND,
				(value) => {
					setCanUndo(value);
					return false;
				},
				COMMAND_PRIORITY_LOW,
			),
			editor.registerCommand(
				CAN_REDO_COMMAND,
				(value) => {
					setCanRedo(value);
					return false;
				},
				COMMAND_PRIORITY_LOW,
			),
		);
	}, [editor]);

	const setParagraph = () => editor.update(() => {
		const selection = $getSelection();
		if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createParagraphNode());
	});
	const setHeading = () => editor.update(() => {
		const selection = $getSelection();
		if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createHeadingNode('h2'));
	});

	return <div class="editor-toolbar" role="toolbar" aria-label="Document formatting">
		<div class="toolbar-group">
			<ToolbarButton
				label="Undo"
				disabled={!canUndo}
				onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
			>{'↶'}</ToolbarButton>
			<ToolbarButton
				label="Redo"
				disabled={!canRedo}
				onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
			>{'↷'}</ToolbarButton>
		</div>
		<span class="toolbar-divider" />
		<div class="toolbar-group">
			<ToolbarButton
				label="Paragraph"
				active={blockType === 'paragraph'}
				pressed={blockType === 'paragraph' ? 'true' : 'false'}
				onClick={setParagraph}
			>{'Text'}</ToolbarButton>
			<ToolbarButton
				label="Heading 2"
				active={blockType === 'h2'}
				pressed={blockType === 'h2' ? 'true' : 'false'}
				onClick={setHeading}
			>{'H2'}</ToolbarButton>
		</div>
		<span class="toolbar-divider" />
		<div class="toolbar-group">
			<ToolbarButton
				label="Bold"
				active={bold}
				pressed={bold ? 'true' : 'false'}
				onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}
			>
				<strong>{'B'}</strong>
			</ToolbarButton>
			<ToolbarButton
				label="Italic"
				active={italic}
				pressed={italic ? 'true' : 'false'}
				onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}
			>
				<em>{'I'}</em>
			</ToolbarButton>
			<ToolbarButton
				label="Underline"
				active={underline}
				pressed={underline ? 'true' : 'false'}
				onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}
			>
				<u>{'U'}</u>
			</ToolbarButton>
		</div>
	</div>;
}

function EditorChangePlugin(props) {
	return <OnChangePlugin
		ignoreSelectionChange={true}
		onChange={(editorState) => {
			let plainText = '';
			editorState.read(() => {
				plainText = $getRoot().getTextContent();
			});
			props.onChange(JSON.stringify(editorState.toJSON()), plainText);
		}}
	/>;
}

type SaveOwnerStatus = 'dirty' | 'saving' | 'offline' | 'error' | 'saved';

type SaveOwner = {
	id: string;
	title: string;
	editorState: string;
	plainText: string;
	change: number;
	savedChange: number;
	nextVersion: number;
	latestRequest: number;
	savingChange: number | null;
	timer: number | null;
	online: boolean;
	status: SaveOwnerStatus;
	error: string;
	listeners: Set<() => void>;
};

const saveOwners = new Map<string, SaveOwner>();
const savedDocumentListeners = new Set<(documentId: string, title: string) => void>();

function emitSaveOwner(owner: SaveOwner) {
	for (const listener of owner.listeners) listener();
}

function clearSaveOwnerTimer(owner: SaveOwner) {
	if (owner.timer === null) return;
	window.clearTimeout(owner.timer);
	owner.timer = null;
}

function ownerForDocument(document: PageDocument): SaveOwner {
	const existing = saveOwners.get(document.id);
	if (existing !== undefined) {
		if (existing.change === existing.savedChange && document.version > existing.nextVersion) {
			existing.title = document.title;
			existing.editorState = document.editorState;
		}
		existing.nextVersion = Math.max(existing.nextVersion, document.version);
		return existing;
	}
	const owner: SaveOwner = {
		id: document.id,
		title: document.title,
		editorState: document.editorState,
		plainText: '',
		change: 0,
		savedChange: 0,
		nextVersion: document.version,
		latestRequest: 0,
		savingChange: null,
		timer: null,
		online: navigator.onLine,
		status: navigator.onLine ? 'saved' : 'offline',
		error: '',
		listeners: new Set(),
	};
	saveOwners.set(document.id, owner);
	return owner;
}

function scheduleSaveOwner(owner: SaveOwner, delay = 260) {
	clearSaveOwnerTimer(owner);
	if (owner.change <= owner.savedChange) return;
	if (!owner.online) {
		owner.status = 'offline';
		emitSaveOwner(owner);
		return;
	}
	owner.timer = window.setTimeout(() => {
		owner.timer = null;
		void saveOwner(owner);
	}, delay);
}

async function saveOwner(owner: SaveOwner) {
	clearSaveOwnerTimer(owner);
	if (owner.change <= owner.savedChange) {
		owner.status = owner.online ? 'saved' : 'offline';
		emitSaveOwner(owner);
		return;
	}
	if (!owner.online) {
		owner.status = 'offline';
		emitSaveOwner(owner);
		return;
	}
	if (owner.status === 'saving' && owner.savingChange === owner.change) return;

	const snapshot = {
		title: owner.title,
		editorState: owner.editorState,
		plainText: owner.plainText,
		change: owner.change,
	};
	const request = owner.latestRequest + 1;
	owner.latestRequest = request;
	owner.savingChange = snapshot.change;
	const version = owner.nextVersion + 1;
	owner.nextVersion = version;
	owner.status = 'saving';
	owner.error = '';
	emitSaveOwner(owner);

	try {
		const result = await saveDocument(owner.id, {
			title: snapshot.title,
			editorState: snapshot.editorState,
			plainText: snapshot.plainText,
			version,
		});
		owner.nextVersion = Math.max(owner.nextVersion, result.version);
		if (request !== owner.latestRequest) return;
		owner.savingChange = null;
		if (!result.applied) {
			owner.error = 'The server rejected this save version. Your local draft is still here.';
			owner.status = 'error';
			emitSaveOwner(owner);
			return;
		}
		owner.savedChange = Math.max(owner.savedChange, snapshot.change);
		for (const listener of savedDocumentListeners) listener(owner.id, snapshot.title);
		if (snapshot.change === owner.change) {
			owner.status = 'saved';
		} else {
			owner.status = 'dirty';
			if (owner.timer === null) scheduleSaveOwner(owner);
		}
		emitSaveOwner(owner);
	} catch (error) {
		if (request !== owner.latestRequest) return;
		owner.savingChange = null;
		if (!navigator.onLine) {
			owner.online = false;
			owner.status = 'offline';
		} else if (snapshot.change !== owner.change) {
			owner.status = 'dirty';
			if (owner.timer === null) scheduleSaveOwner(owner);
		} else {
			owner.error = error instanceof Error
				? error.message
				: 'Pagecraft could not save this document';
			owner.status = 'error';
		}
		emitSaveOwner(owner);
	}
}

function changeSaveOwner(owner: SaveOwner, nextSnapshot) {
	owner.change += 1;
	Object.assign(owner, nextSnapshot);
	owner.error = '';
	owner.status = owner.online ? 'dirty' : 'offline';
	scheduleSaveOwner(owner);
	emitSaveOwner(owner);
}

function flushSaveOwner(documentId: string | null) {
	if (documentId === null) return;
	const owner = saveOwners.get(documentId);
	if (owner !== undefined && owner.change > owner.savedChange) void saveOwner(owner);
}

function setSaveOwnersOnline(online: boolean) {
	for (const owner of saveOwners.values()) {
		owner.online = online;
		if (!online) {
			clearSaveOwnerTimer(owner);
			owner.latestRequest += 1;
			owner.savingChange = null;
			owner.status = 'offline';
			emitSaveOwner(owner);
		} else if (owner.change > owner.savedChange) {
			owner.status = 'dirty';
			scheduleSaveOwner(owner, 80);
			emitSaveOwner(owner);
		} else {
			owner.status = 'saved';
			emitSaveOwner(owner);
		}
	}
}

function saveLabel(state) {
	if (state === 'dirty') return 'Unsaved changes';
	if (state === 'saving') return 'Saving…';
	if (state === 'offline') return 'Offline · edits stay here';
	if (state === 'error') return 'Autosave needs attention';
	if (state === 'invalid') return 'Title required · not saved';
	return 'All changes saved';
}

function DocumentSurface(props) {
	const document = props.document;
	const owner = ownerForDocument(document);
	const [title, setTitle] = useState(owner.title);
	const [titleInvalid, setTitleInvalid] = useState(false);
	const [, forceRender] = useState(0);

	useEffect(() => {
		const listener = () => {
			forceRender((value) => value + 1);
		};
		owner.listeners.add(listener);
		return () => {
			owner.listeners.delete(listener);
		};
	}, [owner]);

	const saveState = titleInvalid ? 'invalid' : owner.status;

	return <article class="document-surface" aria-labelledby="document-heading">
		<header class="document-header">
			<div>
				<p class="document-eyebrow">
					{document.eyebrow as string}
				</p>
				<h1 id="document-heading" class="document-semantic-title">
					{title.trim() || 'Untitled document' as string}
				</h1>
				<input
					id="document-title"
					class="document-title"
					aria-label="Document title"
					aria-invalid={titleInvalid ? 'true' : 'false'}
					maxLength={120}
					required={true}
					value={title}
					onInput={(event) => {
						const nextTitle = event.currentTarget.value;
						setTitle(nextTitle);
						const invalid = nextTitle.trim().length === 0;
						setTitleInvalid(invalid);
						if (!invalid) changeSaveOwner(owner, { title: nextTitle });
					}}
					onBlur={() => {
						if (!title.trim()) {
							setTitle(owner.title);
							setTitleInvalid(false);
						}
					}}
				/>
				@if (titleInvalid) {
					<p class="title-error" role="alert">Add a title before saving.</p>
				}
			</div>
			<div class={'save-indicator ' + saveState} role="status" aria-live="polite">
				<span class="save-dot" />
				<span>
					{saveLabel(saveState) as string}
				</span>
			</div>
		</header>

		<LexicalComposer
			initialConfig={{
				namespace: `Pagecraft-${document.id}`,
				theme: pagecraftTheme,
				nodes: PAGECRAFT_NODES,
				editorState: owner.editorState,
				onError: (error) => {
					throw error;
				},
			}}
		>
			<div class="editor-frame">
				<EditorToolbar />
				<div class="editor-canvas">
					<RichTextPlugin
						contentEditable={<ContentEditable
							aria-label="Document body"
							class="document-editor"
							placeholder={EditorPlaceholder}
						/>}
						ErrorBoundary={LexicalErrorBoundary}
					/>
					<HistoryPlugin />
					<ListPlugin />
					<EditorChangePlugin
						onChange={(editorState, plainText) => changeSaveOwner(owner, {
							editorState,
							plainText,
						})}
					/>
				</div>
			</div>
		</LexicalComposer>

		@if (owner.status === 'error' && !titleInvalid) {
			<div class="save-error" role="alert">
				<div>
					<strong>We could not autosave.</strong>
					<p>
						{owner.error as string}
					</p>
				</div>
				<button type="button" class="retry-button" onClick={() => void saveOwner(owner)}>
					Retry save
				</button>
			</div>
		}
		<footer class="document-footer">
			<span>Private workspace</span>
			<span aria-hidden="true">·</span>
			<span>Changes are saved automatically</span>
		</footer>
	</article>;
}

function LoadingDocument() {
	return <div class="document-loading" role="status">
		<div class="loading-line short" />
		<div class="loading-line title" />
		<div class="loading-card">
			<div class="loading-line" />
			<div class="loading-line" />
			<div class="loading-line medium" />
		</div>
		<span>Opening document…</span>
	</div>;
}

export function App() {
	const [route, setRoute] = useState(readRoute);
	const [documents, setDocuments] = useState([]);
	const [libraryState, setLibraryState] = useState('loading');
	const [documentState, setDocumentState] = useState({ status: 'idle', documentId: null });
	const [loadAttempt, setLoadAttempt] = useState(0);
	const routeRef = useRef(route);
	routeRef.current = route;

	useEffect(() => {
		let active = true;
		loadDocuments().then(
			(result) => {
				if (!active) return;
				setDocuments(result.documents);
				setLibraryState('ready');
			},
			() => {
				if (active) setLibraryState('error');
			},
		);
		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		const onPopState = () => {
			flushSaveOwner(routeRef.current.documentId);
			setRoute(readRoute());
		};
		const onOnline = () => setSaveOwnersOnline(true);
		const onOffline = () => setSaveOwnersOnline(false);
		const onSavedDocument = (documentId: string, title: string) => {
			updateDocumentTitle(documentId, title);
		};
		window.addEventListener('popstate', onPopState);
		window.addEventListener('online', onOnline);
		window.addEventListener('offline', onOffline);
		savedDocumentListeners.add(onSavedDocument);
		return () => {
			window.removeEventListener('popstate', onPopState);
			window.removeEventListener('online', onOnline);
			window.removeEventListener('offline', onOffline);
			savedDocumentListeners.delete(onSavedDocument);
			for (const owner of saveOwners.values()) clearSaveOwnerTimer(owner);
		};
	}, []);

	useEffect(() => {
		const documentId = route.documentId;
		if (documentId === null) {
			setDocumentState({ status: 'idle', documentId: null });
			return;
		}
		let active = true;
		setDocumentState({ status: 'loading', documentId });
		loadDocument(documentId).then(
			(result) => {
				if (!active) return;
				if (result.ok) {
					setDocumentState({ status: 'ready', documentId, document: result.document });
				} else {
					setDocumentState({
						status: result.kind === 'not-found' ? 'not-found' : 'error',
						documentId,
						message: result.message,
					});
				}
			},
			() => {
				if (active) {
					setDocumentState({
						status: 'error',
						documentId,
						message: navigator.onLine
							? 'Pagecraft could not open this document.'
							: 'You are offline. Reconnect, then try again.',
					});
				}
			},
		);
		return () => {
			active = false;
		};
	}, [route.documentId, loadAttempt]);

	function openDocument(documentId, event) {
		if (event !== undefined) {
			if (
				event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
			) return;
			event.preventDefault();
		}
		if (route.documentId === documentId) return;
		flushSaveOwner(route.documentId);
		window.history.pushState({}, '', documentURL(documentId));
		setRoute({ documentId });
	}

	function openWorkspace(event) {
		if (
			event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
		) return;
		event.preventDefault();
		flushSaveOwner(route.documentId);
		window.history.pushState({}, '', `/documents${window.location.search}`);
		setRoute({ documentId: null });
	}

	function updateDocumentTitle(documentId, title) {
		setDocuments(
			(items) => items.map(
				(item) => (item.id === documentId
					? { ...item, title, updatedAt: 'Edited just now' }
					: item),
			),
		);
	}

	const currentMatches = documentState.documentId === route.documentId;

	return <div class="workspace-shell">
		<a class="skip-link" href="#document-workspace">Skip to document</a>
		<aside class="workspace-sidebar" aria-label="Pagecraft workspace">
			<header class="brand-block">
				<a class="brand" href={`/documents${window.location.search}`} onClick={openWorkspace}>
					<span class="brand-mark" aria-hidden="true">P</span>
					<span>
						<strong>Pagecraft</strong>
						<small>Northstar studio</small>
					</span>
				</a>
			</header>
			<div class="sidebar-heading">
				<span>Your documents</span>
				<span class="document-count">
					{documents.length as string}
				</span>
			</div>
			<nav class="document-nav" aria-label="Documents">
				@if (libraryState === 'loading') {
					<div class="nav-loading" role="status">Loading documents…</div>
				} @else if (libraryState === 'error') {
					<p class="nav-error">The document list is unavailable.</p>
				} @else {
					@for (const item of documents; key item.id) {
						<a
							class={route.documentId === item.id ? 'document-link is-current' : 'document-link'}
							href={documentURL(item.id)}
							aria-current={route.documentId === item.id ? 'page' : undefined}
							onClick={(event) => openDocument(item.id, event)}
						>
							<span class="document-glyph" aria-hidden="true">{'◇'}</span>
							<span class="document-link-copy">
								<strong>
									{item.title as string}
								</strong>
								<small>
									{item.updatedAt as string}
								</small>
							</span>
						</a>
					}
				}
			</nav>
			<footer class="sidebar-footer">
				<span class="avatar" aria-hidden="true">AR</span>
				<span>
					<strong>Alex Rowan</strong>
					<small>Editor</small>
				</span>
			</footer>
		</aside>

		<main class="workspace-main" id="document-workspace" tabindex="-1">
			@if (route.documentId === null) {
				<section class="workspace-empty">
					<span class="empty-mark" aria-hidden="true">{'✦'}</span>
					<p class="document-eyebrow">Northstar studio</p>
					<h1>Choose a document and make a little progress.</h1>
					<p>Your recent work is waiting in the sidebar. Every change saves as you type.</p>
					@if (documents.length > 0) {
						<a
							class="primary-link"
							href={documentURL(documents[0].id)}
							onClick={(event) => openDocument(documents[0].id, event)}
						>
							Open
							{documents[0].title as string}
						</a>
					}
				</section>
			} @else if (!currentMatches || documentState.status === 'loading') {
				<LoadingDocument />
			} @else if (documentState.status === 'error') {
				<section class="document-problem" role="alert">
					<span class="problem-mark" aria-hidden="true">{'↻'}</span>
					<p class="document-eyebrow">A temporary pause</p>
					<h1>Let’s try that document again.</h1>
					<p>
						{documentState.message as string}
					</p>
					<button
						type="button"
						class="primary-button"
						onClick={() => setLoadAttempt((value) => value + 1)}
					>
						Retry opening
					</button>
				</section>
			} @else if (documentState.status === 'not-found') {
				<section class="document-problem" role="alert">
					<span class="problem-mark" aria-hidden="true">{'404'}</span>
					<p class="document-eyebrow">Missing page</p>
					<h1>That document is not in this workspace.</h1>
					<p>
						{documentState.message as string}
					</p>
					<a
						class="primary-link"
						href={`/documents${window.location.search}`}
						onClick={openWorkspace}
					>
						Return to Pagecraft
					</a>
				</section>
			} @else if (documentState.status === 'ready') {
				<DocumentSurface key={documentState.document.id} document={documentState.document} />
			}
		</main>
	</div>;
}
