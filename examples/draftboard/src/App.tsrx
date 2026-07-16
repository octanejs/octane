import {
	createPortal,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from 'octane';
import { boardURL, readBoardId } from './router';
import { createFirstShape, createSeededBoard } from './seed';
import { readStoredBoard, writeStoredBoard } from './storage';
import { cloneDocument } from './types';
import type {
	BoardDocument,
	BoardId,
	BoardShape,
	CanvasHandle,
	Point,
	SyncState,
	Tool,
} from './types';

type LoadState = 'loading' | 'ready' | 'error';

interface BoardDraft {
	document: BoardDocument;
	changeRevision: number;
	savedRevision: number;
}

const VIEW_WIDTH = 1200;
const VIEW_HEIGHT = 720;
const SHAPE_COLORS = ['#ffd166', '#74d3ae', '#8ec5ff', '#f6a6c1'] as const;

function scenarioIncludes(name: string): boolean {
	return new URLSearchParams(window.location.search).get('scenario')?.split(',').includes(name) ??
		false;
}

function syncLabel(state: SyncState, online: boolean, pendingChanges: number): string {
	if (!online) {
		if (pendingChanges === 0) return 'Offline · changes stay local';
		return pendingChanges === 1
			? 'Offline · 1 change queued'
			: `Offline · ${pendingChanges} changes queued`;
	}
	switch (state) {
		case 'saving':
			return 'Saving latest changes…';
		case 'queued':
			return 'Waiting to sync…';
		case 'error':
			return 'Save needs attention';
		case 'saved':
			return 'Synced · all changes saved';
	}
}

export function App() @{
	const [boardId, setBoardId] = useState<BoardId>(() => readBoardId());
	const [loadState, setLoadState] = useState<LoadState>('loading');
	const [document, setDocument] = useState<BoardDocument | null>(null);
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [tool, setTool] = useState<Tool>('select');
	const [undoStack, setUndoStack] = useState<BoardDocument[]>([]);
	const [redoStack, setRedoStack] = useState<BoardDocument[]>([]);
	const [online, setOnline] = useState(() => navigator.onLine);
	const [syncState, setSyncState] = useState<SyncState>('saved');
	const [changeRevision, setChangeRevision] = useState(0);
	const [savedRevision, setSavedRevision] = useState(0);
	const [saveRetry, setSaveRetry] = useState(0);
	const [activity, setActivity] = useState('Opening Draftboard');
	const [showShortcuts, setShowShortcuts] = useState(false);
	const loadFailurePendingRef = useRef(scenarioIncludes('load-failure'));
	const saveFailurePendingRef = useRef(scenarioIncludes('save-failure'));
	const loadTimerRef = useRef<number | null>(null);
	const saveTimerRef = useRef<number | null>(null);
	const loadGenerationRef = useRef(0);
	const saveGenerationRef = useRef(0);
	const documentRef = useRef<BoardDocument | null>(null);
	const activeBoardIdRef = useRef<BoardId>(boardId);
	const changeRevisionRef = useRef(0);
	const savedRevisionRef = useRef(0);
	const onlineRef = useRef(navigator.onLine);
	const boardDraftsRef = useRef(new Map<BoardId, BoardDraft>());
	const canvasApiRef = useRef<CanvasHandle | null>(null);
	const shortcutsTriggerRef = useRef<HTMLButtonElement | null>(null);

	documentRef.current = document;
	activeBoardIdRef.current = boardId;
	changeRevisionRef.current = changeRevision;
	savedRevisionRef.current = savedRevision;
	onlineRef.current = online;

	const loadBoard = useCallback((nextBoardId: BoardId) => {
		const outgoingDocument = documentRef.current;
		if (outgoingDocument !== null && outgoingDocument.id !== nextBoardId) {
			const outgoingDraft = boardDraftsRef.current.get(outgoingDocument.id);
			if (
				outgoingDraft !== undefined && outgoingDraft.changeRevision > outgoingDraft.savedRevision &&
					onlineRef.current &&
					writeStoredBoard(outgoingDraft.document)
			) {
				boardDraftsRef.current.set(outgoingDocument.id, {
					...outgoingDraft,
					savedRevision: outgoingDraft.changeRevision,
				});
			}
		}
		const generation = ++loadGenerationRef.current;
		++saveGenerationRef.current;
		if (loadTimerRef.current !== null) window.clearTimeout(loadTimerRef.current);
		if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
		setLoadState('loading');
		setDocument(null);
		setSelectedIds([]);
		setUndoStack([]);
		setRedoStack([]);
		changeRevisionRef.current = 0;
		savedRevisionRef.current = 0;
		setChangeRevision(0);
		setSavedRevision(0);
		setSyncState('saved');
		setActivity(`Loading ${nextBoardId === 'launch' ? 'Launch narrative' : 'Blank exploration'}`);
		loadTimerRef.current = window.setTimeout(() => {
			if (generation !== loadGenerationRef.current) return;
			loadTimerRef.current = null;
			if (loadFailurePendingRef.current) {
				loadFailurePendingRef.current = false;
				setLoadState('error');
				setActivity('Board load failed');
				return;
			}
			const cachedDraft = boardDraftsRef.current.get(nextBoardId);
			const nextDocument =
				cachedDraft?.document ?? readStoredBoard(nextBoardId) ?? createSeededBoard(nextBoardId);
			const nextDraft =
				cachedDraft ??
					{
						document: nextDocument,
						changeRevision: 0,
						savedRevision: 0,
					};
			boardDraftsRef.current.set(nextBoardId, nextDraft);
			documentRef.current = nextDocument;
			changeRevisionRef.current = nextDraft.changeRevision;
			savedRevisionRef.current = nextDraft.savedRevision;
			setDocument(nextDocument);
			setChangeRevision(nextDraft.changeRevision);
			setSavedRevision(nextDraft.savedRevision);
			setSyncState(
				nextDraft.changeRevision > nextDraft.savedRevision
					? onlineRef.current
						? 'queued'
						: 'queued'
					: 'saved',
			);
			setLoadState('ready');
			setActivity(
				nextDocument.shapes.length === 0
					? 'Blank exploration is ready'
					: `${nextDocument.shapes.length} objects loaded`,
			);
		}, 220);
	}, []);

	useEffect(() => {
		loadBoard(boardId);
	}, [boardId, loadBoard]);

	useEffect(() => {
		const handleRoute = () => setBoardId(readBoardId());
		const handleOnline = () => {
			onlineRef.current = true;
			setOnline(true);
			for (const [draftBoardId, draft] of boardDraftsRef.current) {
				if (draft.changeRevision <= draft.savedRevision) continue;
				if (!writeStoredBoard(draft.document)) {
					if (draftBoardId === activeBoardIdRef.current) setSyncState('error');
					continue;
				}
				const savedDraft = { ...draft, savedRevision: draft.changeRevision };
				boardDraftsRef.current.set(draftBoardId, savedDraft);
				if (draftBoardId === activeBoardIdRef.current) {
					savedRevisionRef.current = savedDraft.savedRevision;
					setSavedRevision(savedDraft.savedRevision);
					setSyncState('saved');
					setActivity('All offline board changes saved');
				}
			}
		};
		const handleOffline = () => {
			onlineRef.current = false;
			setOnline(false);
		};
		window.addEventListener('popstate', handleRoute);
		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);
		return () => {
			window.removeEventListener('popstate', handleRoute);
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
			if (loadTimerRef.current !== null) window.clearTimeout(loadTimerRef.current);
			if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
		};
	}, []);

	useEffect(() => {
		if (loadState !== 'ready' || changeRevision <= savedRevision) return;
		const currentDocument = documentRef.current;
		if (currentDocument === null) return;
		if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
		const generation = ++saveGenerationRef.current;
		if (!online) {
			setSyncState('queued');
			return;
		}
		setSyncState('saving');
		saveTimerRef.current = window.setTimeout(() => {
			if (generation !== saveGenerationRef.current) return;
			saveTimerRef.current = null;
			if (saveFailurePendingRef.current) {
				saveFailurePendingRef.current = false;
				setSyncState('error');
				setActivity('Autosave failed. Your edits are still on this canvas.');
				return;
			}
			const latestDocument = documentRef.current;
			if (latestDocument === null || latestDocument.id !== currentDocument.id) return;
			if (!writeStoredBoard(latestDocument)) {
				setSyncState('error');
				setActivity('Browser storage refused the save. Your canvas is still open.');
				return;
			}
			const latestDraft = boardDraftsRef.current.get(latestDocument.id);
			if (latestDraft !== undefined) {
				boardDraftsRef.current.set(latestDocument.id, {
					...latestDraft,
					savedRevision: changeRevision,
				});
			}
			savedRevisionRef.current = changeRevision;
			setSavedRevision(changeRevision);
			setSyncState('saved');
			setActivity('Latest board changes saved');
		}, 300);
		return () => {
			if (saveTimerRef.current !== null) {
				window.clearTimeout(saveTimerRef.current);
				saveTimerRef.current = null;
			}
		};
	}, [boardId, changeRevision, loadState, online, saveRetry, savedRevision]);

	const navigateToBoard = useCallback((nextBoardId: BoardId) => {
		if (nextBoardId === boardId) return;
		history.pushState(null, '', boardURL(nextBoardId));
		setBoardId(nextBoardId);
	}, [boardId]);

	const markDocumentChanged = useCallback((next: BoardDocument) => {
		const nextRevision = changeRevisionRef.current + 1;
		changeRevisionRef.current = nextRevision;
		setChangeRevision(nextRevision);
		boardDraftsRef.current.set(next.id, {
			document: next,
			changeRevision: nextRevision,
			savedRevision: savedRevisionRef.current,
		});
	}, []);

	const recordCommit = useCallback((
		before: BoardDocument,
		next: BoardDocument,
		message: string,
	) => {
		documentRef.current = next;
		setDocument(next);
		setUndoStack((current) => [...current.slice(-49), cloneDocument(before)]);
		setRedoStack([]);
		markDocumentChanged(next);
		setActivity(message);
	}, [markDocumentChanged]);

	const undo = useCallback(() => {
		const currentDocument = documentRef.current;
		if (currentDocument === null || undoStack.length === 0) return;
		const previous = cloneDocument(undoStack[undoStack.length - 1]);
		setUndoStack((current) => current.slice(0, -1));
		setRedoStack((current) => [...current.slice(-49), cloneDocument(currentDocument)]);
		documentRef.current = previous;
		setDocument(previous);
		setSelectedIds(
			(current) => current.filter((id) => previous.shapes.some((shape) => shape.id === id)),
		);
		markDocumentChanged(previous);
		setActivity('Undid the last canvas change');
	}, [markDocumentChanged, undoStack]);

	const redo = useCallback(() => {
		const currentDocument = documentRef.current;
		if (currentDocument === null || redoStack.length === 0) return;
		const next = cloneDocument(redoStack[redoStack.length - 1]);
		setRedoStack((current) => current.slice(0, -1));
		setUndoStack((current) => [...current.slice(-49), cloneDocument(currentDocument)]);
		documentRef.current = next;
		setDocument(next);
		setSelectedIds(
			(current) => current.filter((id) => next.shapes.some((shape) => shape.id === id)),
		);
		markDocumentChanged(next);
		setActivity('Redid the canvas change');
	}, [markDocumentChanged, redoStack]);

	const createBlankShape = useCallback(() => {
		const currentDocument = documentRef.current;
		if (currentDocument === null) return;
		const shape = createFirstShape();
		const next = { ...currentDocument, shapes: [...currentDocument.shapes, shape] };
		setSelectedIds([shape.id]);
		recordCommit(currentDocument, next, 'First idea added to the board');
	}, [recordCommit]);

	const openShortcuts = useCallback((trigger: HTMLButtonElement) => {
		shortcutsTriggerRef.current = trigger;
		setShowShortcuts(true);
	}, []);

	const closeShortcuts = useCallback(() => {
		setShowShortcuts(false);
		const target = shortcutsTriggerRef.current;
		requestAnimationFrame(() => target?.focus());
	}, []);

	const pendingChanges = Math.max(0, changeRevision - savedRevision);
	const selectedShapes = document?.shapes.filter((shape) => selectedIds.includes(shape.id)) ?? [];

	<div
		class="draftboard-shell"
		inert={showShortcuts ? true : undefined}
		aria-hidden={showShortcuts ? 'true' : undefined}
	>
		<a
			class="skip-link"
			href="#draftboard-canvas"
			onClick={(event) => {
				event.preventDefault();
				canvasApiRef.current?.focusCanvas();
			}}
		>Skip to canvas</a>
		<aside class="rail" aria-label="Draftboard navigation">
			<a
				class="wordmark"
				href={boardURL('launch')}
				onClick={(event) => {
					event.preventDefault();
					navigateToBoard('launch');
				}}
			>D</a>
			<nav aria-label="Boards">
				<a
					class={['rail-link', boardId === 'launch' && 'rail-link--active']}
					href={boardURL('launch')}
					aria-current={boardId === 'launch' ? 'page' : undefined}
					onClick={(event) => {
						event.preventDefault();
						navigateToBoard('launch');
					}}
				>
					<span aria-hidden="true">✦</span>
					<span>Launch</span>
				</a>
				<a
					class={['rail-link', boardId === 'empty' && 'rail-link--active']}
					href={boardURL('empty')}
					aria-current={boardId === 'empty' ? 'page' : undefined}
					onClick={(event) => {
						event.preventDefault();
						navigateToBoard('empty');
					}}
				>
					<span aria-hidden="true">＋</span>
					<span>Blank</span>
				</a>
			</nav>
			<div class="avatar" title="Maya Chen">MC</div>
		</aside>

		<main class="workspace">
			<header class="topbar">
				<div class="board-heading">
					<p class="eyebrow">Northstar workspace / Product strategy</p>
					<h1>
						{document?.title ?? (boardId === 'launch' ? 'Launch narrative' : 'Blank exploration')}
					</h1>
					<p class="collaborators">
						{document?.updatedBy ?? 'Opening board'}
					</p>
				</div>
				<div class="topbar-actions">
					<div
						class={['sync-state', (!online || syncState === 'error') && 'sync-state--attention']}
						role="status"
						aria-live="polite"
					>
						<span class="sync-dot" aria-hidden="true"></span>
						{syncLabel(syncState, online, pendingChanges)}
					</div>
					<button
						class="ghost-button"
						type="button"
						ref={shortcutsTriggerRef}
						onClick={(event) => openShortcuts(event.currentTarget as HTMLButtonElement)}
					>Shortcuts</button>
					<button
						class="share-button"
						type="button"
						onClick={() => setActivity('Board link copied for teammates')}
					>Share</button>
				</div>
			</header>

			@if (!online) {
				<div class="offline-banner" role="note">
					<strong>Working offline.</strong>
					Gestures and history stay available; Draftboard will save the latest canvas when you
					reconnect.
				</div>
			}

			@if (syncState === 'error') {
				<div class="save-alert" role="alert">
					<div>
						<strong>We couldn’t save the latest board.</strong>
						<span>Your edits remain visible and can be retried safely.</span>
					</div>
					<button type="button" onClick={() => setSaveRetry((value) => value + 1)}>
						Retry save
					</button>
				</div>
			}

			@if (loadState === 'loading') {
				<LoadingCanvas />
			} @else if (loadState === 'error') {
				<LoadFailure onRetry={() => loadBoard(boardId)} />
			} @else if (document) {
				<section class="editor" data-testid="board-ready">
					<div class="tool-row" role="toolbar" aria-label="Canvas tools">
						<div class="tool-cluster">
							<button
								type="button"
								class={tool === 'select' ? 'tool-button tool-button--active' : 'tool-button'}
								aria-pressed={tool === 'select'}
								onClick={() => setTool('select')}
							>
								<span aria-hidden="true">↖</span>
								Select
							</button>
							<button
								type="button"
								class={tool === 'rectangle' ? 'tool-button tool-button--active' : 'tool-button'}
								aria-pressed={tool === 'rectangle'}
								onClick={() => setTool('rectangle')}
							>
								<span aria-hidden="true">□</span>
								Rectangle
							</button>
							<button
								type="button"
								class={tool === 'hand' ? 'tool-button tool-button--active' : 'tool-button'}
								aria-pressed={tool === 'hand'}
								onClick={() => setTool('hand')}
							>
								<span aria-hidden="true">✋</span>
								Hand
							</button>
						</div>
						<div class="tool-cluster tool-cluster--history">
							<button
								type="button"
								aria-label="Undo"
								disabled={undoStack.length === 0}
								onClick={undo}
							>↶</button>
							<button
								type="button"
								aria-label="Redo"
								disabled={redoStack.length === 0}
								onClick={redo}
							>↷</button>
							<span class="tool-separator" aria-hidden="true"></span>
							<button
								type="button"
								aria-label="Zoom out"
								onClick={() => canvasApiRef.current?.zoomBy(-0.2)}
							>−</button>
							<button
								type="button"
								aria-label="Zoom in"
								onClick={() => canvasApiRef.current?.zoomBy(0.2)}
							>＋</button>
							<button type="button" onClick={() => canvasApiRef.current?.fitSelection()}>
								Fit selection
							</button>
							<button type="button" onClick={() => canvasApiRef.current?.focusCanvas()}>
								Focus canvas
							</button>
						</div>
					</div>

					<div class="canvas-layout">
						<div class="canvas-stage">
							<BoardCanvas
								canvasRef={canvasApiRef}
								document={document}
								selectedIds={selectedIds}
								tool={tool}
								onToolChange={setTool}
								onSelectionChange={setSelectedIds}
								onPreview={(next) => {
									documentRef.current = next;
									setDocument(next);
								}}
								onCommit={recordCommit}
								onUndo={undo}
								onRedo={redo}
								onActivity={setActivity}
							/>
							@if (document.shapes.length === 0) {
								<div class="empty-board" role="status">
									<div class="empty-spark" aria-hidden="true">✦</div>
									<h2>This canvas is ready for its first idea</h2>
									<p>Add a note here, or choose Rectangle and draw anywhere.</p>
									<button type="button" onClick={createBlankShape}>Create first idea</button>
								</div>
							}
						</div>

						<aside class="inspector" aria-label="Selection inspector">
							<p class="inspector-kicker">Selection</p>
							@if (selectedShapes.length === 0) {
								<>
									<h2>Nothing selected</h2>
									<p>Select an object to inspect it. Hold Shift to select more than one.</p>
								</>
							} @else {
								<>
									<h2>
										{selectedShapes.length === 1
											? selectedShapes[0].label
											: `${selectedShapes.length} items selected`}
									</h2>
									<p>
										{selectedShapes.length === 1
											? 'One editable canvas object'
											: 'Drag to move this group together'}
									</p>
									<dl>
										<div>
											<dt>Objects</dt>
											<dd>
												{selectedShapes.length as string}
											</dd>
										</div>
										<div>
											<dt>X</dt>
											<dd>
												<output aria-label="Selected X coordinate">
													{Math.round(selectedShapes[0].x) as string}
												</output>
											</dd>
										</div>
										<div>
											<dt>Y</dt>
											<dd>
												<output aria-label="Selected Y coordinate">
													{Math.round(selectedShapes[0].y) as string}
												</output>
											</dd>
										</div>
									</dl>
								</>
							}
							<div class="hint-card">
								<span aria-hidden="true">⌨</span>
								<p>
									<strong>Keyboard ready</strong>
									<br />
									Arrows move · Alt + arrows choose · Delete removes · ⌘/Ctrl Z restores
								</p>
							</div>
						</aside>
					</div>
					<footer class="activity-bar">
						<span role="status" aria-live="polite">{activity}</span>
						<span>{`${document.shapes.length} ${
							document.shapes.length === 1 ? 'object' : 'objects'
						} · ${selectedIds.length} selected`}</span>
					</footer>
				</section>
			}
		</main>

		@if (showShortcuts) {
			<KeyboardHelpPortal onClose={closeShortcuts} />
		}
	</div>
}

function LoadingCanvas() @{
	<section class="loading-canvas" aria-label="Loading whiteboard" aria-busy="true">
		<div class="loading-toolbar skeleton"></div>
		<div class="loading-stage skeleton">
			<span></span>
			<span></span>
			<span></span>
		</div>
	</section>
}

function LoadFailure(props) @{
	<section class="load-failure" role="alert">
		<div class="failure-icon" aria-hidden="true">!</div>
		<h2>We couldn’t load this board</h2>
		<p>The deterministic fixture is still available. Retry without losing the board link.</p>
		<button type="button" onClick={props.onRetry}>Retry loading</button>
	</section>
}

type DragInteraction = {
	kind: 'drag';
	pointerId: number;
	start: Point;
	before: BoardDocument;
	shapeIds: string[];
	moved: boolean;
};

type DrawInteraction = {
	kind: 'draw';
	pointerId: number;
	start: Point;
	before: BoardDocument;
	shape: BoardShape;
};

type PanInteraction = {
	kind: 'pan';
	pointerId: number;
	startClient: Point;
	origin: Point;
};

type CanvasInteraction = DragInteraction | DrawInteraction | PanInteraction;

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function BoardCanvas(props) @{
	const [zoom, setZoom] = useState(1);
	const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
	const [draftShape, setDraftShape] = useState<BoardShape | null>(null);
	const [keyboardShapeId, setKeyboardShapeId] = useState<string | null>(
		() => props.document.shapes[0]?.id ?? null,
	);
	const svgRef = useRef<SVGSVGElement | null>(null);
	const interactionRef = useRef<CanvasInteraction | null>(null);
	const pointerFocusRef = useRef(false);
	const documentRef = useRef<BoardDocument>(props.document);
	const shapeElementsRef = useRef(new Map<string, SVGGElement>());
	const shapeSequenceRef = useRef(1);

	documentRef.current = props.document;

	useEffect(() => {
		if (
			keyboardShapeId === null ||
				!props.document.shapes.some((shape) => shape.id === keyboardShapeId)
		) {
			setKeyboardShapeId(props.document.shapes[0]?.id ?? null);
		}
	}, [keyboardShapeId, props.document.shapes]);

	const focusCanvas = useCallback(() => {
		svgRef.current?.focus();
		props.onActivity('Canvas focused. Keyboard shortcuts are ready.');
	}, [props.onActivity]);

	const zoomBy = useCallback((amount: number) => {
		setZoom((current) => {
			const next = clamp(Number((current + amount).toFixed(2)), 0.4, 2.4);
			props.onActivity(`Canvas zoom ${Math.round(next * 100)}%`);
			return next;
		});
	}, [props.onActivity]);

	const fitSelection = useCallback(() => {
		const selected = documentRef.current.shapes.filter(
			(shape) => props.selectedIds.includes(shape.id),
		);
		if (selected.length === 0) {
			setZoom(1);
			setPan({ x: 0, y: 0 });
			props.onActivity('Canvas reset to 100%');
			return;
		}
		const left = Math.min(...selected.map((shape) => shape.x));
		const top = Math.min(...selected.map((shape) => shape.y));
		const right = Math.max(...selected.map((shape) => shape.x + shape.width));
		const bottom = Math.max(...selected.map((shape) => shape.y + shape.height));
		const nextZoom = clamp(Math.min(720 / (right - left), 420 / (bottom - top)), 0.6, 2);
		setZoom(nextZoom);
		setPan({
			x: VIEW_WIDTH / 2 - ((left + right) / 2) * nextZoom,
			y: VIEW_HEIGHT / 2 - ((top + bottom) / 2) * nextZoom,
		});
		props.onActivity(
			`Fit ${selected.length} selected ${selected.length === 1 ? 'object' : 'objects'}`,
		);
	}, [props.onActivity, props.selectedIds]);

	useImperativeHandle(props.canvasRef, () => ({ focusCanvas, zoomBy, fitSelection }), [
		props.canvasRef,
		focusCanvas,
		zoomBy,
		fitSelection,
	]);

	const pointFromEvent = (event: PointerEvent): Point => {
		const svg = svgRef.current;
		if (svg === null) return { x: 0, y: 0 };
		const bounds = svg.getBoundingClientRect();
		const viewX = ((event.clientX - bounds.left) / bounds.width) * VIEW_WIDTH;
		const viewY = ((event.clientY - bounds.top) / bounds.height) * VIEW_HEIGHT;
		return { x: (viewX - pan.x) / zoom, y: (viewY - pan.y) / zoom };
	};

	const capturePointer = (pointerId: number) => {
		svgRef.current?.setPointerCapture(pointerId);
	};

	const handlePointerDown = (event: PointerEvent) => {
		if (event.button !== 0) return;
		const svg = svgRef.current;
		if (svg === null) return;
		const world = pointFromEvent(event);
		const target = event.target as Element;
		const shapeElement = target.closest('[data-shape-id]');
		const hitShapeId = shapeElement?.getAttribute('data-shape-id') ?? null;

		if (props.tool === 'hand') {
			capturePointer(event.pointerId);
			interactionRef.current = {
				kind: 'pan',
				pointerId: event.pointerId,
				startClient: { x: event.clientX, y: event.clientY },
				origin: pan,
			};
			props.onActivity('Panning canvas');
			return;
		}

		if (props.tool === 'rectangle') {
			let sequence = shapeSequenceRef.current++;
			let id = `shape-${props.document.id}-${sequence}`;
			while (props.document.shapes.some((shape) => shape.id === id)) {
				sequence = shapeSequenceRef.current++;
				id = `shape-${props.document.id}-${sequence}`;
			}
			const shape: BoardShape = {
				id,
				label: `Canvas note ${sequence}`,
				x: world.x,
				y: world.y,
				width: 24,
				height: 24,
				fill: SHAPE_COLORS[(sequence - 1) % SHAPE_COLORS.length],
			};
			capturePointer(event.pointerId);
			interactionRef.current = {
				kind: 'draw',
				pointerId: event.pointerId,
				start: world,
				before: cloneDocument(props.document),
				shape,
			};
			setDraftShape(shape);
			props.onActivity('Drawing a rectangle');
			return;
		}

		if (hitShapeId === null) {
			props.onSelectionChange([]);
			props.onActivity('Selection cleared');
			return;
		}
		pointerFocusRef.current = true;
		requestAnimationFrame(() => {
			pointerFocusRef.current = false;
		});
		setKeyboardShapeId(hitShapeId);

		let nextSelection: string[];
		if (event.shiftKey) {
			if (props.selectedIds.includes(hitShapeId)) {
				nextSelection = props.selectedIds.filter((id) => id !== hitShapeId);
				props.onSelectionChange(nextSelection);
				props.onActivity(`${hitShapeId} removed from selection`);
				return;
			}
			nextSelection = [...props.selectedIds, hitShapeId];
		} else {
			nextSelection = props.selectedIds.includes(hitShapeId) ? props.selectedIds : [hitShapeId];
		}
		props.onSelectionChange(nextSelection);
		capturePointer(event.pointerId);
		interactionRef.current = {
			kind: 'drag',
			pointerId: event.pointerId,
			start: world,
			before: cloneDocument(props.document),
			shapeIds: nextSelection,
			moved: false,
		};
		props.onActivity(
			nextSelection.length === 1
				? `${hitShapeId} selected`
				: `${nextSelection.length} objects selected`,
		);
	};

	const handlePointerMove = (event: PointerEvent) => {
		const interaction = interactionRef.current;
		if (interaction === null || interaction.pointerId !== event.pointerId) return;
		if (interaction.kind === 'pan') {
			const svg = svgRef.current;
			if (svg === null) return;
			const bounds = svg.getBoundingClientRect();
			setPan({
				x: interaction.origin.x +
					((event.clientX - interaction.startClient.x) / bounds.width) * VIEW_WIDTH,
				y: interaction.origin.y +
					((event.clientY - interaction.startClient.y) / bounds.height) * VIEW_HEIGHT,
			});
			return;
		}

		const world = pointFromEvent(event);
		if (interaction.kind === 'draw') {
			const shape = {
				...interaction.shape,
				x: Math.min(interaction.start.x, world.x),
				y: Math.min(interaction.start.y, world.y),
				width: Math.max(24, Math.abs(world.x - interaction.start.x)),
				height: Math.max(24, Math.abs(world.y - interaction.start.y)),
			};
			interaction.shape = shape;
			setDraftShape(shape);
			return;
		}

		const dx = world.x - interaction.start.x;
		const dy = world.y - interaction.start.y;
		if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) interaction.moved = true;
		const next: BoardDocument = {
			...interaction.before,
			shapes: interaction.before.shapes.map(
				(shape) => interaction.shapeIds.includes(shape.id)
					? { ...shape, x: shape.x + dx, y: shape.y + dy }
					: shape,
			),
		};
		documentRef.current = next;
		props.onPreview(next);
	};

	const finishPointer = (event: PointerEvent) => {
		const interaction = interactionRef.current;
		if (interaction === null || interaction.pointerId !== event.pointerId) return;
		interactionRef.current = null;
		const svg = svgRef.current;
		if (svg?.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);

		if (interaction.kind === 'drag') {
			if (interaction.moved) {
				props.onCommit(
					interaction.before,
					documentRef.current,
					interaction.shapeIds.length === 1
						? 'Object moved on the canvas'
						: `${interaction.shapeIds.length} objects moved together`,
				);
			}
			return;
		}
		if (interaction.kind === 'draw') {
			setDraftShape(null);
			const next = {
				...interaction.before,
				shapes: [...interaction.before.shapes, interaction.shape],
			};
			documentRef.current = next;
			props.onSelectionChange([interaction.shape.id]);
			setKeyboardShapeId(interaction.shape.id);
			props.onCommit(interaction.before, next, `${interaction.shape.label} added`);
			props.onToolChange('select');
			return;
		}
		props.onActivity('Canvas panned');
	};

	const cancelPointer = (event: PointerEvent) => {
		const interaction = interactionRef.current;
		if (interaction === null || interaction.pointerId !== event.pointerId) return;
		interactionRef.current = null;
		if (interaction.kind === 'drag') {
			documentRef.current = interaction.before;
			props.onPreview(interaction.before);
		}
		setDraftShape(null);
		props.onActivity('Canvas gesture canceled');
	};

	const handleKeyDown = (event: KeyboardEvent) => {
		const command = event.metaKey || event.ctrlKey;
		if (command && event.key.toLowerCase() === 'z') {
			event.preventDefault();
			if (event.shiftKey) props.onRedo();
			else props.onUndo();
			return;
		}
		if (command && event.key.toLowerCase() === 'y') {
			event.preventDefault();
			props.onRedo();
			return;
		}
		if (event.altKey && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
			event.preventDefault();
			const shapes = documentRef.current.shapes;
			if (shapes.length === 0) return;
			const currentIndex = Math.max(0, shapes.findIndex((shape) => shape.id === keyboardShapeId));
			const direction =
				event.key === 'ArrowRight' ? 1 : -1;
			const nextIndex = (currentIndex + direction + shapes.length) % shapes.length;
			const nextShape = shapes[nextIndex];
			setKeyboardShapeId(nextShape.id);
			props.onSelectionChange([nextShape.id]);
			props.onActivity(`${nextShape.label} selected by keyboard`);
			requestAnimationFrame(() => shapeElementsRef.current.get(nextShape.id)?.focus());
			return;
		}
		if ((event.key === 'Delete' || event.key === 'Backspace') && props.selectedIds.length > 0) {
			event.preventDefault();
			const before = cloneDocument(documentRef.current);
			const next = {
				...before,
				shapes: before.shapes.filter((shape) => !props.selectedIds.includes(shape.id)),
			};
			const focusedIndex = before.shapes.findIndex((shape) => shape.id === keyboardShapeId);
			const nextKeyboardShape = next.shapes[Math.min(
				Math.max(0, focusedIndex),
				next.shapes.length - 1,
			)];
			documentRef.current = next;
			props.onSelectionChange([]);
			setKeyboardShapeId(nextKeyboardShape?.id ?? null);
			props.onCommit(
				before,
				next,
				props.selectedIds.length === 1
					? 'Object deleted'
					: `${props.selectedIds.length} objects deleted`,
			);
			if (nextKeyboardShape !== undefined) {
				requestAnimationFrame(
					() => requestAnimationFrame(
						() => shapeElementsRef.current.get(nextKeyboardShape.id)?.focus(),
					),
				);
			} else {
				requestAnimationFrame(() => svgRef.current?.focus());
			}
			return;
		}
		const offsets: Record<string, Point> = {
			ArrowLeft: { x: -1, y: 0 },
			ArrowRight: { x: 1, y: 0 },
			ArrowUp: { x: 0, y: -1 },
			ArrowDown: { x: 0, y: 1 },
		};
		const offset = offsets[event.key];
		if (offset === undefined || props.selectedIds.length === 0) return;
		event.preventDefault();
		const distance = event.shiftKey ? 10 : 2;
		const before = cloneDocument(documentRef.current);
		const next = {
			...before,
			shapes: before.shapes.map(
				(shape) => props.selectedIds.includes(shape.id)
					? { ...shape, x: shape.x + offset.x * distance, y: shape.y + offset.y * distance }
					: shape,
			),
		};
		documentRef.current = next;
		props.onCommit(
			before,
			next,
			`${props.selectedIds.length} selected ${
				props.selectedIds.length === 1 ? 'object' : 'objects'
			} nudged`,
		);
	};

	<svg
		id="draftboard-canvas"
		class={['board-canvas', `board-canvas--${props.tool}`]}
		ref={svgRef}
		viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
		preserveAspectRatio="none"
		tabIndex="0"
		role="application"
		aria-label="Draftboard canvas"
		data-zoom={zoom as string}
		data-pan-x={Math.round(pan.x) as string}
		data-pan-y={Math.round(pan.y) as string}
		onPointerDown={handlePointerDown}
		onPointerMove={handlePointerMove}
		onPointerUp={finishPointer}
		onPointerCancel={cancelPointer}
		onWheel={(event) => zoomBy(event.deltaY < 0 ? 0.1 : -0.1)}
		onKeyDown={handleKeyDown}
	>
		<defs>
			<pattern id="draft-grid" width="24" height="24" patternUnits="userSpaceOnUse">
				<circle cx="1" cy="1" r="1" fill="#cac8dc"></circle>
			</pattern>
			<filter id="shape-shadow" x="-20%" y="-20%" width="140%" height="150%">
				<feDropShadow
					dx="0"
					dy="8"
					stdDeviation="8"
					flood-color="#34304e"
					flood-opacity="0.15"
				></feDropShadow>
			</filter>
		</defs>
		<rect
			data-canvas-background="true"
			width={VIEW_WIDTH}
			height={VIEW_HEIGHT}
			fill="#f7f6fb"
		></rect>
		<rect
			pointer-events="none"
			width={VIEW_WIDTH}
			height={VIEW_HEIGHT}
			fill="url(#draft-grid)"
		></rect>
		<g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
			@for (const shape of props.document.shapes; key shape.id) {
				<CanvasShape
					shape={shape}
					selected={props.selectedIds.includes(shape.id)}
					focusable={shape.id === keyboardShapeId}
					onRegister={(element, previous) => {
						if (element !== null) shapeElementsRef.current.set(shape.id, element);
						else if (previous !== null && shapeElementsRef.current.get(shape.id) === previous) {
							shapeElementsRef.current.delete(shape.id);
						}
					}}
					onKeyboardFocus={() => {
						if (pointerFocusRef.current) return;
						setKeyboardShapeId(shape.id);
						props.onSelectionChange([shape.id]);
						props.onActivity(`${shape.label} selected by keyboard`);
					}}
				/>
			}
			@if (draftShape) {
				<g class="canvas-object canvas-object--draft" data-testid="draft-shape">
					<rect
						x={draftShape.x}
						y={draftShape.y}
						width={draftShape.width}
						height={draftShape.height}
						rx="12"
						fill={draftShape.fill}
					></rect>
				</g>
			}
		</g>
	</svg>
}

function CanvasShape(props) @{
	const centerX = props.shape.x + props.shape.width / 2;
	const centerY = props.shape.y + props.shape.height / 2;
	<g
		ref={props.onRegister}
		class={['canvas-object', props.selected && 'canvas-object--selected']}
		data-shape-id={props.shape.id}
		data-x={Math.round(props.shape.x) as string}
		data-y={Math.round(props.shape.y) as string}
		data-selected={props.selected ? 'true' : 'false'}
		role="button"
		aria-label={`${props.shape.label} shape`}
		tabIndex={props.focusable ? 0 : -1}
		onFocus={props.onKeyboardFocus}
	>
		<rect
			x={props.shape.x}
			y={props.shape.y}
			width={props.shape.width}
			height={props.shape.height}
			rx="14"
			fill={props.shape.fill}
			filter="url(#shape-shadow)"
		></rect>
		<rect
			class="selection-outline"
			x={props.shape.x - 5}
			y={props.shape.y - 5}
			width={props.shape.width + 10}
			height={props.shape.height + 10}
			rx="18"
		></rect>
		<text
			class="shape-label"
			x={centerX}
			y={centerY - 4}
			text-anchor="middle"
		>{props.shape.label}</text>
		<text class="shape-meta" x={centerX} y={centerY + 23} text-anchor="middle">Product note</text>
		@if (props.selected) {
			<circle
				class="selection-handle"
				cx={props.shape.x + props.shape.width}
				cy={props.shape.y + props.shape.height}
				r="7"
			></circle>
		}
	</g>
}

function KeyboardHelpPortal(props) {
	const target = document.getElementById('modal-root');
	if (target === null) return null;
	return createPortal(KeyboardHelpDialog, target, props);
}

function KeyboardHelpDialog(props) @{
	const closeRef = useRef<HTMLButtonElement | null>(null);
	const doneRef = useRef<HTMLButtonElement | null>(null);
	useEffect(() => {
		closeRef.current?.focus();
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			event.preventDefault();
			props.onClose();
		};
		document.addEventListener('keydown', handleEscape, true);
		return () => document.removeEventListener('keydown', handleEscape, true);
	}, [props.onClose]);
	<div
		class="modal-backdrop"
		onPointerDown={(event) => {
			if (event.target === event.currentTarget) props.onClose();
		}}
	>
		<section
			class="shortcut-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="shortcut-title"
			onKeyDown={(event) => {
				if (event.key !== 'Tab') return;
				const first = closeRef.current;
				const last = doneRef.current;
				if (first === null || last === null) return;
				if (event.shiftKey && document.activeElement === first) {
					event.preventDefault();
					last.focus();
				} else if (!event.shiftKey && document.activeElement === last) {
					event.preventDefault();
					first.focus();
				}
			}}
		>
			<div class="dialog-heading">
				<div>
					<p class="eyebrow">Work at canvas speed</p>
					<h2 id="shortcut-title">Draftboard shortcuts</h2>
				</div>
				<button ref={closeRef} type="button" aria-label="Close shortcuts" onClick={props.onClose}>
					×
				</button>
			</div>
			<dl class="shortcut-list">
				<div>
					<dt>Move selection</dt>
					<dd>
						<kbd>Arrow keys</kbd>
					</dd>
				</div>
				<div>
					<dt>Move faster</dt>
					<dd>
						<kbd>Shift</kbd>
						+
						<kbd>Arrow</kbd>
					</dd>
				</div>
				<div>
					<dt>Remove</dt>
					<dd>
						<kbd>Delete</kbd>
					</dd>
				</div>
				<div>
					<dt>Undo / redo</dt>
					<dd>
						<kbd>⌘/Ctrl Z</kbd>
						·
						<kbd>Shift ⌘/Ctrl Z</kbd>
					</dd>
				</div>
			</dl>
			<p class="dialog-note">
				Focus the canvas before using a shortcut. Pointer gestures continue to use native capture
				outside its visible bounds.
			</p>
			<div class="dialog-actions">
				<button ref={doneRef} type="button" onClick={props.onClose}>Got it</button>
			</div>
		</section>
	</div>
}
