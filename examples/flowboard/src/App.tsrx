import { createPortal, useCallback, useEffect, useMemo, useRef, useState } from 'octane';
import { DragDropProvider, DragOverlay, useDroppable } from '@octanejs/dnd-kit';
import type { DragEndEvent, DragStartEvent } from '@octanejs/dnd-kit';
import { useSortable } from '@octanejs/dnd-kit/sortable';
import { createSeededIssues } from './seed';
import { boardURL, issueURL, readBoardRoute } from './router';
import { ISSUE_STATUSES, isIssueStatus, statusLabel } from './types';
import type {
	BoardRoute,
	ColumnDragData,
	FlowboardDragData,
	Issue,
	IssueDragData,
	IssuePriority,
	IssueStatus,
} from './types';

type LoadState = 'loading' | 'ready' | 'error';
type PriorityFilter = 'all' | IssuePriority;

const COLUMNS: readonly { status: IssueStatus; hint: string }[] = [
	{ status: 'backlog', hint: 'Ready to shape' },
	{ status: 'in-progress', hint: 'Actively building' },
	{ status: 'review', hint: 'Needs a second look' },
	{ status: 'done', hint: 'Shipped this cycle' },
];

function dragData(value: unknown): FlowboardDragData | null {
	if (!value || typeof value !== 'object') return null;
	const record = value as Record<string, unknown>;
	if (
		record.kind === 'column' && typeof record.status === 'string' && isIssueStatus(record.status)
	) {
		return { kind: 'column', status: record.status };
	}
	if (
		record.kind === 'issue' && typeof record.issueId === 'string' &&
			typeof record.status === 'string' &&
			isIssueStatus(record.status) &&
			typeof record.index === 'number'
	) {
		return {
			kind: 'issue',
			issueId: record.issueId,
			status: record.status,
			index: record.index,
		};
	}
	return null;
}

function reorderIssues(
	issues: readonly Issue[],
	issueId: string,
	destination: IssueStatus,
	targetIssueId?: string,
): Issue[] {
	const moving = issues.find((issue) => issue.id === issueId);
	if (!moving) return [...issues];

	const byStatus = new Map<IssueStatus, Issue[]>();
	for (const status of ISSUE_STATUSES) {
		byStatus.set(status, issues.filter((issue) => issue.status === status && issue.id !== issueId));
	}

	const destinationIssues = byStatus.get(destination) ?? [];
	const targetIndex =
		targetIssueId ? destinationIssues.findIndex((issue) => issue.id === targetIssueId) : -1;
	const movedIssue =
		moving.status === destination ? moving : { ...moving, status: destination };
	destinationIssues.splice(targetIndex < 0 ? destinationIssues.length : targetIndex, 0, movedIssue);
	byStatus.set(destination, destinationIssues);

	return ISSUE_STATUSES.flatMap((status) => byStatus.get(status) ?? []);
}

export function App() @{
	const [route, setRoute] = useState<BoardRoute>(() => readBoardRoute());
	const [loadState, setLoadState] = useState<LoadState>('loading');
	const [issues, setIssues] = useState<Issue[]>([]);
	const [query, setQuery] = useState('');
	const [priority, setPriority] = useState<PriorityFilter>('all');
	const [online, setOnline] = useState(() => navigator.onLine);
	const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
	const [activity, setActivity] = useState('Board ready');
	const [moveCount, setMoveCount] = useState(0);
	const failurePendingRef = useRef(
		new URLSearchParams(window.location.search).get('scenario') === 'failure',
	);
	const returnFocusRef = useRef<HTMLElement | null>(null);
	const boardHeadingRef = useRef<HTMLHeadingElement | null>(null);
	const cardElementsRef = useRef(new Map<string, HTMLElement>());
	const loadTimerRef = useRef<number | null>(null);

	const loadBoard = useCallback(() => {
		setLoadState('loading');
		if (loadTimerRef.current !== null) window.clearTimeout(loadTimerRef.current);
		loadTimerRef.current = window.setTimeout(() => {
			if (failurePendingRef.current) {
				failurePendingRef.current = false;
				setLoadState('error');
				return;
			}
			setIssues(createSeededIssues());
			setLoadState('ready');
			setActivity('6 issues loaded from the local fixture');
		}, 180);
	}, []);

	useEffect(() => {
		loadBoard();
		return () => {
			if (loadTimerRef.current !== null) window.clearTimeout(loadTimerRef.current);
		};
	}, [loadBoard]);

	useEffect(() => {
		const syncRoute = () => setRoute(readBoardRoute());
		const markOnline = () => setOnline(true);
		const markOffline = () => setOnline(false);
		window.addEventListener('popstate', syncRoute);
		window.addEventListener('online', markOnline);
		window.addEventListener('offline', markOffline);
		return () => {
			window.removeEventListener('popstate', syncRoute);
			window.removeEventListener('online', markOnline);
			window.removeEventListener('offline', markOffline);
		};
	}, []);

	const openIssue = useCallback((issueId: string, trigger: HTMLElement | null) => {
		returnFocusRef.current = trigger;
		history.pushState(null, '', issueURL(issueId));
		setRoute({ issueId });
	}, []);

	const closeIssue = useCallback(() => {
		history.pushState(null, '', boardURL());
		setRoute({ issueId: null });
		const focusTarget = returnFocusRef.current ?? boardHeadingRef.current;
		requestAnimationFrame(() => focusTarget?.focus());
	}, []);

	const registerCardElement = useCallback((
		issueId: string,
		element: HTMLElement | null,
		previous: HTMLElement | null,
	) => {
		const elements = cardElementsRef.current;
		if (element !== null) {
			elements.set(issueId, element);
		} else if (previous !== null && elements.get(issueId) === previous) {
			elements.delete(issueId);
		}
	}, []);

	const moveIssue = useCallback((
		issueId: string,
		destination: IssueStatus,
		targetIssueId?: string,
		restoreKeyboardFocus = false,
	) => {
		setIssues((current) => reorderIssues(current, issueId, destination, targetIssueId));
		setMoveCount((count) => count + 1);
		setActivity(`${issueId} moved to ${statusLabel(destination)}`);
		if (restoreKeyboardFocus) {
			requestAnimationFrame(() => {
				const control = cardElementsRef.current.get(issueId)?.querySelector<HTMLButtonElement>(
					'[data-keyboard-move]',
				);
				control?.focus();
			});
		}
	}, []);

	const handleDragStart = useCallback((event: DragStartEvent) => {
		const source = dragData(event.operation.source?.data);
		if (source?.kind !== 'issue') return;
		setActiveIssueId(source.issueId);
		setActivity(`Moving ${source.issueId}`);
	}, []);

	const handleDragEnd = useCallback((event: DragEndEvent) => {
		const source = dragData(event.operation.source?.data);
		const target = dragData(event.operation.target?.data);
		setActiveIssueId(null);
		if (event.canceled || source?.kind !== 'issue' || target === null) {
			setActivity(event.canceled ? 'Move canceled' : 'Issue returned to its original column');
			return;
		}
		moveIssue(source.issueId, target.status, target.kind === 'issue' ? target.issueId : undefined);
	}, [moveIssue]);

	const visibleIssues = useMemo(() => {
		const normalizedQuery = query.trim().toLocaleLowerCase();
		return issues.filter((issue) => {
			const matchesPriority = priority === 'all' || issue.priority === priority;
			const haystack = `${issue.id} ${issue.title} ${issue.assignee.name} ${issue.labels.join(
				' ',
			)}`.toLocaleLowerCase();
			return matchesPriority && (normalizedQuery === '' || haystack.includes(normalizedQuery));
		});
	}, [issues, query, priority]);

	const activeIssue = activeIssueId
		? issues.find((issue) => issue.id === activeIssueId) ?? null
		: null;
	const routedIssue = route.issueId
		? issues.find((issue) => issue.id === route.issueId) ?? null
		: null;

	<div class="app-shell">
		<a class="skip-link" href="#flowboard-board">Skip to board</a>
		<aside class="sidebar" aria-label="Workspace navigation">
			<div class="brand-mark" aria-hidden="true">F</div>
			<nav aria-label="Primary navigation">
				<a class="nav-item nav-item--active" href="/board" aria-current="page" title="Board">
					<span aria-hidden="true">▦</span>
					<span>Board</span>
				</a>
				<a class="nav-item" href="#activity" title="Activity">
					<span aria-hidden="true">◔</span>
					<span>Activity</span>
				</a>
			</nav>
			<div class="sidebar-person" title="Maya Chen">MC</div>
		</aside>

		<main class="main-content">
			<header class="topbar">
				<div>
					<p class="eyebrow">Northstar / Product delivery</p>
					<h1 ref={boardHeadingRef} tabIndex={-1}>Flowboard</h1>
				</div>
				<div
					class={['sync-pill', !online && 'sync-pill--offline']}
					role="status"
					aria-live="polite"
				>
					<span class="sync-dot" aria-hidden="true"></span>
					{online ? 'Synced' : 'Offline · changes stay local'}
				</div>
			</header>

			@if (!online) {
				<div class="offline-banner" role="note">
					<strong>You’re offline.</strong>
					Board moves remain available and will sync when the connection returns.
				</div>
			}

			@if (loadState === 'loading') {
				<LoadingBoard />
			} @else if (loadState === 'error') {
				<FailureState onRetry={loadBoard} />
			} @else {
				<section id="flowboard-board" class="board-workspace" data-testid="board-ready">
					<div class="board-toolbar">
						<label class="search-field">
							<span aria-hidden="true">⌕</span>
							<span class="sr-only">Search issues</span>
							<input
								type="search"
								placeholder="Search issues"
								value={query}
								onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
							/>
						</label>
						<label class="filter-field">
							<span>Priority</span>
							<select
								value={priority}
								onChange={(event) => setPriority(
									(event.target as HTMLSelectElement).value as PriorityFilter,
								)}
							>
								<option value="all">All priorities</option>
								<option value="urgent">Urgent</option>
								<option value="high">High</option>
								<option value="medium">Medium</option>
								<option value="low">Low</option>
							</select>
						</label>
						<p class="issue-total">{`${visibleIssues.length} of ${issues.length} issues`}</p>
					</div>

					@if (visibleIssues.length === 0) {
						<div class="filter-empty" role="status">
							<span class="empty-icon" aria-hidden="true">⌕</span>
							<div>
								<strong>No issues match this view</strong>
								<p>Try a different phrase or clear the filters.</p>
							</div>
							<button
								type="button"
								onClick={() => {
									setQuery('');
									setPriority('all');
								}}
							>Clear filters</button>
						</div>
					}

					<DragDropProvider onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
						<div class="board-grid" aria-label="Product delivery board">
							@for (const column of COLUMNS; key column.status) {
								<BoardColumn
									status={column.status}
									hint={column.hint}
									issues={visibleIssues.filter((issue) => issue.status === column.status)}
									onOpenIssue={openIssue}
									onMoveIssue={moveIssue}
									onRegisterCard={registerCardElement}
								/>
							}
						</div>
						<DragOverlay className="drag-layer" dropAnimation={null} tag="div">
							{activeIssue
								? <article
										class="issue-card issue-card--overlay"
										data-testid="drag-overlay-card"
										role="status"
										aria-label={`Moving ${activeIssue.id}`}
									>
										<p class="issue-key">{activeIssue.id}</p>
										<strong>{activeIssue.title}</strong>
										<span class="overlay-assignee">{activeIssue.assignee.initials}</span>
									</article>
								: null}
						</DragOverlay>
					</DragDropProvider>
					<div class="activity-line" id="activity" role="status" aria-live="polite">
						<span>{activity}</span>
						<span>{`${moveCount} ${moveCount === 1 ? 'move' : 'moves'} saved locally`}</span>
					</div>
				</section>
			}
		</main>

		@if (route.issueId && loadState === 'ready') {
			<IssuePortal
				issue={routedIssue}
				requestedId={route.issueId}
				onClose={closeIssue}
				onMoveIssue={moveIssue}
			/>
		}
	</div>
}

function LoadingBoard() @{
	<section class="loading-board" aria-label="Loading project board" aria-busy="true">
		<div class="loading-toolbar skeleton"></div>
		<div class="loading-columns">
			@for (const column of COLUMNS; key column.status) {
				<div class="loading-column">
					<span class="skeleton"></span>
					<span class="skeleton"></span>
					<span class="skeleton"></span>
				</div>
			}
		</div>
		<p class="sr-only">Loading seeded issues…</p>
	</section>
}

type OpenIssue = (issueId: string, trigger: HTMLElement | null) => void;
type MoveIssue =
	(issueId: string, destination: IssueStatus, targetIssueId?: string, restoreKeyboardFocus?: boolean) => void;
type RegisterCard =
	(issueId: string, element: HTMLElement | null, previous: HTMLElement | null) => void;

function FailureState(props: { onRetry: () => void }) @{
	<section class="failure-state" role="alert">
		<div class="failure-symbol" aria-hidden="true">!</div>
		<p class="eyebrow">Fixture connection interrupted</p>
		<h2>We couldn’t load the project board</h2>
		<p>The deterministic issue service returned a temporary error. Your current route is safe.</p>
		<button type="button" onClick={props.onRetry}>Retry loading</button>
	</section>
}

interface BoardColumnProps {
	status: IssueStatus;
	hint: string;
	issues: Issue[];
	onOpenIssue: OpenIssue;
	onMoveIssue: MoveIssue;
	onRegisterCard: RegisterCard;
}

function BoardColumn(props: BoardColumnProps) @{
	const data: ColumnDragData = { kind: 'column', status: props.status };
	const droppable = useDroppable({
		id: `column:${props.status}`,
		data,
		type: 'issue-column',
		accept: ['issue'],
	});

	<section
		class={['board-column', droppable.isDropTarget && 'board-column--target']}
		ref={droppable.ref}
		aria-label={`${statusLabel(props.status)} issues`}
		data-column={props.status}
	>
		<header class="column-header">
			<div>
				<span class={['status-dot', `status-dot--${props.status}`]} aria-hidden="true"></span>
				<h2>{statusLabel(props.status)}</h2>
				<span class="column-count">{String(props.issues.length)}</span>
			</div>
			<p>{props.hint}</p>
		</header>
		<div class="card-stack">
			@for (const issue of props.issues; key issue.id) {
				<IssueCard
					issue={issue}
					index={props.issues.indexOf(issue)}
					onOpenIssue={props.onOpenIssue}
					onMoveIssue={props.onMoveIssue}
					onRegisterCard={props.onRegisterCard}
				/>
			}
			@if (props.issues.length === 0) {
				<div class="column-empty">No issues in this column</div>
			}
		</div>
		<div class="column-drop-hint" aria-hidden="true">Drop issue here</div>
	</section>
}

interface IssueCardProps {
	issue: Issue;
	index: number;
	onOpenIssue: OpenIssue;
	onMoveIssue: MoveIssue;
	onRegisterCard: RegisterCard;
}

function IssueCard(props: IssueCardProps) @{
	const issue: Issue = props.issue;
	const openButtonRef = useRef<HTMLButtonElement | null>(null);
	const registeredCardRef = useRef<HTMLElement | null>(null);
	const registerCardRef = useCallback((element: HTMLElement | null) => {
		const previous = registeredCardRef.current;
		registeredCardRef.current = element;
		props.onRegisterCard(issue.id, element, previous);
	}, [issue.id, props.onRegisterCard]);
	const data: IssueDragData = {
		kind: 'issue',
		issueId: issue.id,
		status: issue.status,
		index: props.index,
	};
	const sortable = useSortable({
		id: issue.id,
		index: props.index,
		group: issue.status,
		type: 'issue',
		accept: ['issue'],
		data,
	});
	const statusIndex = ISSUE_STATUSES.indexOf(issue.status);
	const nextStatus = ISSUE_STATUSES[(statusIndex + 1) % ISSUE_STATUSES.length];

	<article
		class={[
			'issue-card',
			sortable.isDragging && 'issue-card--dragging',
			sortable.isDropTarget && 'issue-card--target',
		]}
		ref={[sortable.ref, registerCardRef]}
		data-issue-id={issue.id}
		data-status={issue.status}
	>
		<div class="card-topline">
			<span class={['priority-mark', `priority-mark--${issue.priority}`]}>{issue.priority}</span>
			<button
				type="button"
				class="drag-handle"
				ref={sortable.handleRef}
				aria-label={`Drag ${issue.id}`}
				aria-describedby={`drag-help-${issue.id}`}
			>
				<span aria-hidden="true">⠿</span>
			</button>
			<span class="sr-only" id={`drag-help-${issue.id}`}>
				Press Space to pick up, arrow keys to move, and Space to drop.
			</span>
		</div>
		<button
			type="button"
			class="issue-title-button"
			ref={openButtonRef}
			onClick={() => props.onOpenIssue(issue.id, openButtonRef.current)}
		>
			<span class="issue-key">{issue.id}</span>
			<span>{issue.title}</span>
		</button>
		<div class="label-row" aria-label="Labels">
			@for (const label of issue.labels; key label) {
				<span>{label}</span>
			}
		</div>
		<footer class="card-footer">
			<span
				class="estimate"
				aria-label={`${issue.estimate} story points`}
			>{`${issue.estimate} pts`}</span>
			<button
				type="button"
				class="keyboard-move"
				data-keyboard-move={issue.id}
				aria-label={`Move ${issue.id} forward to ${statusLabel(nextStatus)}`}
				onClick={() => props.onMoveIssue(issue.id, nextStatus, undefined, true)}
			>
				<span aria-hidden="true">→</span>
			</button>
			<label class="move-control-label">
				<span class="sr-only">{`Set status for ${issue.id}`}</span>
				<select
					aria-label={`Set status for ${issue.id}`}
					value={issue.status}
					onChange={(event) => {
						const destination = (event.target as HTMLSelectElement).value;
						if (isIssueStatus(destination)) props.onMoveIssue(
							issue.id,
							destination,
							undefined,
							true,
						);
					}}
				>
					@for (const status of ISSUE_STATUSES; key status) {
						<option value={status}>{statusLabel(status)}</option>
					}
				</select>
			</label>
			<span
				class="avatar"
				title={issue.assignee.name}
				aria-label={`Assigned to ${issue.assignee.name}`}
			>{issue.assignee.initials}</span>
		</footer>
	</article>
}

interface IssueDialogProps {
	issue: Issue | null;
	requestedId: string;
	onClose: () => void;
	onMoveIssue: MoveIssue;
}

function IssuePortal(props: IssueDialogProps) {
	const target = document.getElementById('modal-root');
	if (!target) return null;
	return createPortal(IssueDialog, target, props);
}

function IssueDialog(props: IssueDialogProps) @{
	const closeRef = useRef<HTMLButtonElement | null>(null);
	const dialogRef = useRef<HTMLDialogElement | null>(null);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (dialog === null) return;
		const onCancel = (event: Event) => {
			event.preventDefault();
			props.onClose();
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Tab') return;
			const focusable = Array.from(
				dialog.querySelectorAll<HTMLElement>(
					'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
						'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
				),
			).filter((element) => element.tabIndex >= 0);
			if (focusable.length === 0) {
				event.preventDefault();
				dialog.focus();
				return;
			}
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			const active = document.activeElement;
			if (event.shiftKey && (active === first || !dialog.contains(active))) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
				event.preventDefault();
				first.focus();
			}
		};
		dialog.addEventListener('cancel', onCancel);
		document.addEventListener('keydown', onKeyDown, true);
		if (!dialog.open) dialog.showModal();
		closeRef.current?.focus();
		return () => {
			dialog.removeEventListener('cancel', onCancel);
			document.removeEventListener('keydown', onKeyDown, true);
			if (dialog.open) dialog.close();
		};
	}, [props.onClose]);

	<dialog
		class="issue-dialog"
		ref={dialogRef}
		tabIndex={-1}
		aria-labelledby="issue-dialog-title"
		aria-describedby="issue-dialog-description"
	>
		<header class="dialog-header">
			<div>
				<p class="eyebrow">Issue detail</p>
				<p class="dialog-key">
					{props.issue?.id ?? props.requestedId}
				</p>
			</div>
			<button
				type="button"
				class="dialog-close"
				ref={closeRef}
				onClick={props.onClose}
				aria-label="Close issue details"
			>×</button>
		</header>
		@if (props.issue) {
			<div class="dialog-content">
				<div class="dialog-main">
					<h2 id="issue-dialog-title">{props.issue.title}</h2>
					<p id="issue-dialog-description">{props.issue.description}</p>
					<section class="activity-card" aria-labelledby="recent-activity-title">
						<h3 id="recent-activity-title">Recent activity</h3>
						<div>
							<span class="avatar">{props.issue.assignee.initials}</span>
							<p>
								<strong>{props.issue.assignee.name}</strong>
								clarified the acceptance criteria.
								<small>Today at 10:24</small>
							</p>
						</div>
					</section>
				</div>
				<aside class="dialog-properties" aria-label="Issue properties">
					<label>
						<span>Status</span>
						<select
							aria-label={`Issue status for ${props.issue.id}`}
							value={props.issue.status}
							onChange={(event) => {
								const destination = (event.target as HTMLSelectElement).value;
								if (props.issue && isIssueStatus(destination)) {
									props.onMoveIssue(props.issue.id, destination);
								}
							}}
						>
							@for (const status of ISSUE_STATUSES; key status) {
								<option value={status}>{statusLabel(status)}</option>
							}
						</select>
					</label>
					<div>
						<span>Priority</span>
						<strong class={`priority-text--${props.issue.priority}`}>{props.issue.priority}</strong>
					</div>
					<div>
						<span>Assignee</span>
						<strong>{props.issue.assignee.name}</strong>
						<small>{props.issue.assignee.role}</small>
					</div>
					<div>
						<span>Estimate</span>
						<strong>{`${props.issue.estimate} story points`}</strong>
					</div>
				</aside>
			</div>
		} @else {
			<div class="dialog-not-found">
				<h2 id="issue-dialog-title">Issue not found</h2>
				<p id="issue-dialog-description">There is no seeded issue named {props.requestedId}.</p>
				<button type="button" onClick={props.onClose}>Return to board</button>
			</div>
		}
	</dialog>
}
