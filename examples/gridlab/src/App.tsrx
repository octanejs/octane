import { useCallback, useEffect, useRef, useState } from 'octane';
import { defaultRangeExtractor, useVirtualizer } from '@octanejs/tanstack-virtual';
import {
	COLUMN_COUNT,
	MAX_CELL_TEXT_LENGTH,
	ROW_COUNT,
	addressLabel,
	baseCellRaw,
	cellKey,
	clampAddress,
	columnLabel,
	displayCell,
	isInSelection,
	parseAddress,
	readStoredCellValues,
	selectionRange,
	selectionSize,
	writeStoredCellValues,
} from './domain';
import type { CellAddress, SelectionRange } from './domain';

type LoadState = 'loading' | 'ready' | 'error';
type SyncState = 'saved' | 'queued' | 'saving' | 'error' | 'offline' | 'storage-error';
type CellValues = Record<string, string>;
type DirtyVersions = Record<string, number>;

const ROW_HEIGHT = 34;
const DEFAULT_COLUMN_WIDTH = 132;
const FIRST_COLUMN_WIDTH = 184;
const INITIAL_RECT = { width: 920, height: 520 };

function rowSize(): number {
	return ROW_HEIGHT;
}

function columnSize(index: number): number {
	return index === 0 ? FIRST_COLUMN_WIDTH : DEFAULT_COLUMN_WIDTH;
}

function pinnedRange(
	range: Parameters<typeof defaultRangeExtractor>[0],
	pinnedIndex: number,
): number[] {
	const indexes = defaultRangeExtractor(range);
	if (!indexes.includes(pinnedIndex)) indexes.push(pinnedIndex);
	return indexes.sort((left, right) => left - right);
}

function syncLabel(state: SyncState, pending: number): string {
	switch (state) {
		case 'saving':
			return `Saving ${pending} change${pending === 1 ? '' : 's'}…`;
		case 'queued':
			return `${pending} change${pending === 1 ? '' : 's'} queued`;
		case 'error':
			return `Sync paused · ${pending} pending`;
		case 'offline':
			return `${pending} change${pending === 1 ? '' : 's'} stored locally`;
		case 'storage-error':
			return 'Local storage unavailable';
		default:
			return 'All changes saved';
	}
}

function rangeLabel(range: SelectionRange): string {
	const start = addressLabel({ row: range.startRow, column: range.startColumn });
	const end = addressLabel({ row: range.endRow, column: range.endColumn });
	return start === end ? start : `${start}:${end}`;
}

function LoadingSheet() {
	return <main class="state-page" aria-label="Loading Atlas forecast" aria-busy="true">
		<div class="state-card state-card--loading">
			<div class="loading-mark" aria-hidden="true">G</div>
			<p class="eyebrow">Gridlab workspace</p>
			<h1>Opening Atlas forecast</h1>
			<p>Preparing 80 columns and 1,000 deterministic planning rows…</p>
			<div class="loading-lines" aria-hidden="true">
				<span></span>
				<span></span>
				<span></span>
			</div>
		</div>
	</main>;
}

function LoadFailure({ onRetry }: { onRetry: () => void }) {
	return <main class="state-page">
		<section class="state-card" role="alert">
			<div class="state-icon" aria-hidden="true">!</div>
			<p class="eyebrow">Atlas forecast</p>
			<h1>Couldn’t open this workbook</h1>
			<p>
				The local fixture stopped before any cells were applied. Your browser data is unchanged.
			</p>
			<button class="primary-button" onClick={onRetry}>Retry opening workbook</button>
		</section>
	</main>;
}

function EmptySheet({ onRestore }: { onRestore: () => void }) {
	return <main class="state-page">
		<section class="state-card" data-testid="empty-sheet">
			<div class="empty-grid-mark" aria-hidden="true">＋</div>
			<p class="eyebrow">Atlas forecast</p>
			<h1>This sheet is empty</h1>
			<p>Restore the deterministic planning rows to explore formulas and virtualized navigation.</p>
			<button class="primary-button" onClick={onRestore}>Restore sample workbook</button>
		</section>
	</main>;
}

export function App() @{
	const [loadState, setLoadState] = useState<LoadState>('loading');
	const [sampleReady, setSampleReady] = useState(true);
	const [cellValues, setCellValues] = useState<CellValues>({});
	const [selected, setSelected] = useState<CellAddress>({ row: 0, column: 0 });
	const [anchor, setAnchor] = useState<CellAddress>({ row: 0, column: 0 });
	const [editing, setEditing] = useState<CellAddress | null>(null);
	const [editorDraft, setEditorDraft] = useState('');
	const [formulaDraft, setFormulaDraft] = useState('');
	const [nameDraft, setNameDraft] = useState('A1');
	const [scrollPosition, setScrollPosition] = useState({ left: 0, top: 0 });
	const [online, setOnline] = useState(() => navigator.onLine);
	const [syncState, setSyncState] = useState<SyncState>('saved');
	const [dirtyVersions, setDirtyVersions] = useState<DirtyVersions>({});
	const [activity, setActivity] = useState('Workbook ready');
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const cellElementsRef = useRef(new Map<string, HTMLElement>());
	const cellValuesRef = useRef<CellValues>({});
	const composingRef = useRef(false);
	const skipBlurCommitRef = useRef(false);
	const loadTimerRef = useRef<number | null>(null);
	const debounceTimerRef = useRef<number | null>(null);
	const requestTimerRef = useRef<number | null>(null);
	const requestGenerationRef = useRef(0);
	const revisionRef = useRef(0);
	const dirtyVersionsRef = useRef<DirtyVersions>({});
	const onlineRef = useRef(navigator.onLine);
	const storageAvailableRef = useRef(true);
	const syncActionRef = useRef<() => void>(() => {});
	const parametersRef = useRef(new URLSearchParams(window.location.search));
	const loadFailurePendingRef = useRef(
		parametersRef.current.get('scenario') === 'load-failure' ||
			parametersRef.current.get('scenario') === 'recovery',
	);
	const syncFailurePendingRef = useRef(
		parametersRef.current.get('scenario') === 'sync-failure' ||
			parametersRef.current.get('scenario') === 'recovery',
	);
	const emptyScenarioRef = useRef(parametersRef.current.get('scenario') === 'empty');

	const readRaw = useCallback((address: CellAddress) => {
		const override = cellValues[cellKey(address)];
		return override === undefined ? baseCellRaw(address) : override;
	}, [cellValues]);

	const runSync = useCallback(() => {
		if (debounceTimerRef.current !== null) {
			window.clearTimeout(debounceTimerRef.current);
			debounceTimerRef.current = null;
		}
		if (requestTimerRef.current !== null) return;
		if (!storageAvailableRef.current) {
			setSyncState('storage-error');
			return;
		}
		const snapshot = { ...dirtyVersionsRef.current };
		const snapshotKeys = Object.keys(snapshot);
		if (snapshotKeys.length === 0) {
			setSyncState('saved');
			return;
		}
		if (!onlineRef.current) {
			setSyncState('offline');
			return;
		}

		const generation = ++requestGenerationRef.current;
		setSyncState('saving');
		requestTimerRef.current = window.setTimeout(() => {
			requestTimerRef.current = null;
			if (generation !== requestGenerationRef.current) return;
			if (!onlineRef.current) {
				setSyncState('offline');
				return;
			}
			if (syncFailurePendingRef.current) {
				syncFailurePendingRef.current = false;
				setSyncState('error');
				setActivity('Sync failed · local edits are safe');
				return;
			}

			const next = { ...dirtyVersionsRef.current };
			for (const key of snapshotKeys) {
				if (next[key] === snapshot[key]) delete next[key];
			}
			dirtyVersionsRef.current = next;
			setDirtyVersions(next);
			const remaining = Object.keys(next).length;
			if (remaining === 0) {
				setSyncState('saved');
				setActivity('All changes saved');
			} else {
				setSyncState('queued');
				setActivity(`${remaining} newer change${remaining === 1 ? '' : 's'} still queued`);
				debounceTimerRef.current = window.setTimeout(() => syncActionRef.current(), 350);
			}
		}, 420);
	}, []);
	syncActionRef.current = runSync;

	const scheduleSync = useCallback(() => {
		if (!storageAvailableRef.current) {
			setSyncState('storage-error');
			return;
		}
		if (!onlineRef.current) {
			setSyncState('offline');
			return;
		}
		if (requestTimerRef.current !== null) return;
		if (debounceTimerRef.current !== null) window.clearTimeout(debounceTimerRef.current);
		setSyncState('queued');
		debounceTimerRef.current = window.setTimeout(() => syncActionRef.current(), 180);
	}, []);

	const applyValues = useCallback((updates: Array<{ address: CellAddress; raw: string }>) => {
		if (updates.length === 0) return;
		const nextValues = { ...cellValuesRef.current };
		for (const update of updates) {
			nextValues[cellKey(update.address)] = update.raw.slice(0, MAX_CELL_TEXT_LENGTH);
		}
		cellValuesRef.current = nextValues;
		setCellValues(nextValues);
		const nextDirty = { ...dirtyVersionsRef.current };
		for (const update of updates) {
			nextDirty[cellKey(update.address)] = ++revisionRef.current;
		}
		dirtyVersionsRef.current = nextDirty;
		setDirtyVersions(nextDirty);
		const pending = Object.keys(nextDirty).length;
		const stored = writeStoredCellValues(nextValues);
		storageAvailableRef.current = stored;
		if (!stored) {
			setSyncState('storage-error');
			setActivity('Local storage unavailable · keep this tab open');
			return;
		}
		setActivity(
			`${updates.length} cell${updates.length === 1 ? '' : 's'} updated · ${pending} pending`,
		);
		scheduleSync();
	}, [scheduleSync]);

	const loadSheet = useCallback(() => {
		setLoadState('loading');
		if (loadTimerRef.current !== null) window.clearTimeout(loadTimerRef.current);
		loadTimerRef.current = window.setTimeout(() => {
			loadTimerRef.current = null;
			if (loadFailurePendingRef.current) {
				loadFailurePendingRef.current = false;
				setLoadState('error');
				return;
			}
			const emptyScenario = emptyScenarioRef.current;
			const stored =
				emptyScenario ? { status: 'empty' as const, cells: {} } : readStoredCellValues();
			cellValuesRef.current = stored.cells;
			setCellValues(stored.cells);
			storageAvailableRef.current = stored.status !== 'unavailable';
			setSyncState(stored.status === 'unavailable' ? 'storage-error' : 'saved');
			setSampleReady(!emptyScenario);
			setLoadState('ready');
			if (emptyScenario) setActivity('Blank workbook opened');
			else if (stored.status === 'restored') {
				const count = Object.keys(stored.cells).length;
				setActivity(`${count} saved cell${count === 1 ? '' : 's'} restored`);
			} else if (stored.status === 'invalid') {
				setActivity('Invalid local workbook ignored · sample loaded');
			} else if (stored.status === 'unavailable') {
				setActivity('Local storage unavailable · sample loaded');
			} else setActivity('1,000 planning rows loaded');
		}, 180);
	}, []);

	useEffect(() => {
		loadSheet();
		const markOffline = () => {
			onlineRef.current = false;
			setOnline(false);
			if (debounceTimerRef.current !== null) {
				window.clearTimeout(debounceTimerRef.current);
				debounceTimerRef.current = null;
			}
			if (requestTimerRef.current !== null) {
				window.clearTimeout(requestTimerRef.current);
				requestTimerRef.current = null;
				requestGenerationRef.current++;
			}
			setSyncState(
				!storageAvailableRef.current
					? 'storage-error'
					: Object.keys(dirtyVersionsRef.current).length > 0
						? 'offline'
						: 'saved',
			);
			setActivity('Offline · edits stay in this browser');
		};
		const markOnline = () => {
			onlineRef.current = true;
			setOnline(true);
			const pending = Object.keys(dirtyVersionsRef.current).length;
			setActivity(pending > 0 ? `Back online · ${pending} pending` : 'Back online');
			if (pending > 0) scheduleSync();
		};
		window.addEventListener('offline', markOffline);
		window.addEventListener('online', markOnline);
		return () => {
			window.removeEventListener('offline', markOffline);
			window.removeEventListener('online', markOnline);
			if (loadTimerRef.current !== null) window.clearTimeout(loadTimerRef.current);
			if (debounceTimerRef.current !== null) window.clearTimeout(debounceTimerRef.current);
			if (requestTimerRef.current !== null) window.clearTimeout(requestTimerRef.current);
		};
	}, [loadSheet, scheduleSync]);

	useEffect(() => {
		setFormulaDraft(readRaw(selected));
		setNameDraft(addressLabel(selected));
	}, [readRaw, selected]);

	const rowVirtualizer = useVirtualizer({
		count: ROW_COUNT,
		getScrollElement: () => scrollRef.current,
		estimateSize: rowSize,
		overscan: 5,
		initialRect: INITIAL_RECT,
		rangeExtractor: (range) => pinnedRange(range, selected.row),
	});
	const columnVirtualizer = useVirtualizer({
		count: COLUMN_COUNT,
		getScrollElement: () => scrollRef.current,
		estimateSize: columnSize,
		horizontal: true,
		overscan: 3,
		initialRect: INITIAL_RECT,
		rangeExtractor: (range) => pinnedRange(range, selected.column),
	});

	const focusAddress = useCallback((address: CellAddress) => {
		requestAnimationFrame(() => {
			requestAnimationFrame(() => cellElementsRef.current.get(cellKey(address))?.focus());
		});
	}, []);

	const selectAddress = useCallback((nextAddress: CellAddress, extend = false, align = 'auto') => {
		const next = clampAddress(nextAddress);
		setSelected(next);
		if (!extend) setAnchor(next);
		rowVirtualizer.scrollToIndex(next.row, { align: align as 'auto' | 'center' });
		columnVirtualizer.scrollToIndex(next.column, { align: align as 'auto' | 'center' });
		focusAddress(next);
	}, [columnVirtualizer, focusAddress, rowVirtualizer]);

	const beginEditing = useCallback((address: CellAddress, initialValue?: string) => {
		const next = clampAddress(address);
		setSelected(next);
		setAnchor(next);
		setEditorDraft(initialValue === undefined ? readRaw(next) : initialValue);
		setEditing(next);
		requestAnimationFrame(() => {
			const editor = cellElementsRef.current.get(cellKey(next))?.querySelector<HTMLInputElement>(
				'input[data-cell-editor]',
			);
			editor?.focus();
			editor?.select();
		});
	}, [readRaw]);

	const commitEditing = useCallback((move?: CellAddress) => {
		if (editing === null) return;
		applyValues([
			{ address: editing, raw: editorDraft },
		]);
		setEditing(null);
		if (move) selectAddress(move);
		else focusAddress(editing);
	}, [applyValues, editing, editorDraft, focusAddress, selectAddress]);

	const currentRange = selectionRange(anchor, selected);
	const pendingCount = Object.keys(dirtyVersions).length;
	const selectedDisplay = displayCell(selected, readRaw);
	const selectedLabel = addressLabel(selected);

	const copySelection = useCallback((event: ClipboardEvent) => {
		if (event.target instanceof HTMLInputElement && event.target.hasAttribute('data-cell-editor')) {
			return;
		}
		const lines: string[] = [];
		for (let row = currentRange.startRow; row <= currentRange.endRow; row++) {
			const values: string[] = [];
			for (let column = currentRange.startColumn; column <= currentRange.endColumn; column++) {
				values.push(readRaw({ row, column }));
			}
			lines.push(values.join('\t'));
		}
		const text = lines.join('\n');
		event.clipboardData?.setData('text/plain', text);
		event.preventDefault();
		setActivity(`${rangeLabel(currentRange)} copied to clipboard`);
	}, [currentRange, readRaw]);

	const pasteSelection = useCallback((event: ClipboardEvent) => {
		if (event.target instanceof HTMLInputElement && event.target.hasAttribute('data-cell-editor')) {
			return;
		}
		const text = event.clipboardData?.getData('text/plain');
		if (text === undefined || text === '') return;
		event.preventDefault();
		const rows = text.replace(/\r\n?/g, '\n').split('\n');
		if (rows.at(-1) === '') rows.pop();
		const updates: Array<{ address: CellAddress; raw: string }> = [];
		let maxColumn = selected.column;
		for (let rowOffset = 0; rowOffset < rows.length; rowOffset++) {
			const values = rows[rowOffset].split('\t');
			for (let columnOffset = 0; columnOffset < values.length; columnOffset++) {
				const address = { row: selected.row + rowOffset, column: selected.column + columnOffset };
				if (address.row >= ROW_COUNT || address.column >= COLUMN_COUNT) continue;
				updates.push({ address, raw: values[columnOffset] });
				maxColumn = Math.max(maxColumn, address.column);
			}
		}
		if (updates.length === 0) return;
		applyValues(updates);
		const last = updates.at(-1)!.address;
		const endpoint = { row: last.row, column: maxColumn };
		setAnchor(selected);
		setSelected(endpoint);
		focusAddress(endpoint);
		setActivity(`${updates.length} pasted cell${updates.length === 1 ? '' : 's'} from clipboard`);
	}, [applyValues, focusAddress, selected]);

	const clearSelection = useCallback(() => {
		const updates: Array<{ address: CellAddress; raw: string }> = [];
		for (let row = currentRange.startRow; row <= currentRange.endRow; row++) {
			for (let column = currentRange.startColumn; column <= currentRange.endColumn; column++) {
				updates.push({ address: { row, column }, raw: '' });
			}
		}
		applyValues(updates);
	}, [applyValues, currentRange]);

	const handleCellKeyDown = useCallback((event: KeyboardEvent, address: CellAddress) => {
		if (editing !== null || event.isComposing || composingRef.current) return;
		let next: CellAddress | null = null;
		switch (event.key) {
			case 'ArrowUp':
				next = { row: address.row - 1, column: address.column };
				break;
			case 'ArrowDown':
				next = { row: address.row + 1, column: address.column };
				break;
			case 'ArrowLeft':
				next = { row: address.row, column: address.column - 1 };
				break;
			case 'ArrowRight':
				next = { row: address.row, column: address.column + 1 };
				break;
			case 'PageUp':
				next = { row: address.row - 14, column: address.column };
				break;
			case 'PageDown':
				next = { row: address.row + 14, column: address.column };
				break;
			case 'Home':
				next = { row: event.ctrlKey || event.metaKey ? 0 : address.row, column: 0 };
				break;
			case 'End':
				next = {
					row: event.ctrlKey || event.metaKey ? ROW_COUNT - 1 : address.row,
					column: COLUMN_COUNT - 1,
				};
				break;
			case 'Enter':
			case 'F2':
				event.preventDefault();
				beginEditing(address);
				return;
			case 'Backspace':
			case 'Delete':
				event.preventDefault();
				clearSelection();
				return;
			default:
				if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
					event.preventDefault();
					beginEditing(address, event.key);
				}
				return;
		}
		if (next !== null) {
			event.preventDefault();
			selectAddress(next, event.shiftKey);
		}
	}, [beginEditing, clearSelection, editing, selectAddress]);

	@if (loadState === 'loading') {
		<LoadingSheet />
	} @else if (loadState === 'error') {
		<LoadFailure onRetry={loadSheet} />
	} @else if (!sampleReady) {
		<EmptySheet
			onRestore={() => {
				emptyScenarioRef.current = false;
				cellValuesRef.current = {};
				setCellValues({});
				storageAvailableRef.current = writeStoredCellValues({});
				setSyncState(storageAvailableRef.current ? 'saved' : 'storage-error');
				setSampleReady(true);
				setActivity('Sample workbook restored · 1,000 rows ready');
			}}
		/>
	} @else {
		<div class="app-shell" data-testid="gridlab-ready">
			<header class="app-header">
				<div class="brand-block">
					<div class="brand-logo" aria-hidden="true">G</div>
					<div>
						<p class="brand-name">Gridlab</p>
						<h1>Atlas forecast</h1>
					</div>
				</div>
				<div class="header-actions">
					<div
						class={['network-pill', !online && 'network-pill--offline']}
						role="status"
						data-testid="network-status"
					>
						<span aria-hidden="true"></span>
						{online ? 'Online' : 'Offline'}
					</div>
					<div
						class={['sync-pill', `sync-pill--${syncState}`]}
						role="status"
						aria-live="polite"
						data-testid="sync-status"
					>{syncLabel(syncState, pendingCount)}</div>
					@if (syncState === 'error') {
						<button class="retry-button" onClick={runSync}>Retry sync</button>
					}
				</div>
			</header>

			<div class="workbook-bar">
				<div class="workbook-meta">
					<span class="workbook-icon" aria-hidden="true">▦</span>
					<div>
						<strong>FY27 operating plan</strong>
						<span>Private workspace · Local fixture</span>
					</div>
				</div>
				<div class="sheet-tabs" role="tablist" aria-label="Workbook sheets">
					<button role="tab" aria-selected="true">Forecast</button>
					<button role="tab" aria-selected="false" disabled>Summary</button>
				</div>
			</div>

			<section class="formula-region" aria-label="Cell controls">
				<form
					class="name-box"
					onSubmit={(event) => {
						event.preventDefault();
						const address = parseAddress(nameDraft);
						if (address) {
							selectAddress(address, false, 'center');
							setActivity(`${addressLabel(address)} selected`);
						} else {
							setNameDraft(selectedLabel);
							setActivity(`${nameDraft.trim() || 'That address'} is outside this workbook`);
						}
					}}
				>
					<label for="cell-address">Name</label>
					<input
						id="cell-address"
						aria-label="Cell address"
						value={nameDraft}
						onInput={(event) => setNameDraft((event.target as HTMLInputElement).value)}
					/>
				</form>
				<span class="formula-equals" aria-hidden="true">ƒx</span>
				<form
					class="formula-box"
					onSubmit={(event) => {
						event.preventDefault();
						applyValues([
							{ address: selected, raw: formulaDraft },
						]);
						focusAddress(selected);
					}}
				>
					<label class="sr-only" for="formula-input">
						Formula for
						{selectedLabel as string}
					</label>
					<input
						id="formula-input"
						aria-label={'Formula for ' + selectedLabel}
						value={formulaDraft}
						maxLength={MAX_CELL_TEXT_LENGTH}
						spellCheck={false}
						onInput={(event) => setFormulaDraft((event.target as HTMLInputElement).value)}
					/>
				</form>
				<div class="selection-summary" aria-label="Current selection">
					<strong>{rangeLabel(currentRange) as string}</strong>
					<span>
						{selectionSize(currentRange) === 1
							? selectedDisplay
							: `${selectionSize(currentRange)} cells`}
					</span>
				</div>
			</section>

			<main class="sheet-workspace">
				<div class="grid-frame">
					<div class="corner-header" aria-hidden="true"></div>
					<div class="column-headers" aria-hidden="true">
						<div
							class="column-header-track"
							style={{
								width: columnVirtualizer.getTotalSize() + 'px',
								transform: 'translateX(' + -scrollPosition.left + 'px)',
							}}
						>
							@for (const column of columnVirtualizer.getVirtualItems(); key column.key) {
								<div
									class={['column-header', column.index === selected.column && 'is-selected']}
									data-column-header={columnLabel(column.index)}
									style={{
										width: column.size + 'px',
										transform: 'translateX(' + column.start + 'px)',
									}}
								>{columnLabel(column.index) as string}</div>
							}
						</div>
					</div>
					<div class="row-headers" aria-hidden="true">
						<div
							class="row-header-track"
							style={{
								height: rowVirtualizer.getTotalSize() + 'px',
								transform: 'translateY(' + -scrollPosition.top + 'px)',
							}}
						>
							@for (const row of rowVirtualizer.getVirtualItems(); key row.key) {
								<div
									class={['row-header', row.index === selected.row && 'is-selected']}
									data-row-header={row.index + 1}
									style={{
										height: row.size + 'px',
										transform: 'translateY(' + row.start + 'px)',
									}}
								>{`${row.index + 1}`}</div>
							}
						</div>
					</div>
					<div
						ref={scrollRef}
						class="grid-viewport"
						role="grid"
						aria-label="Atlas forecast spreadsheet"
						aria-rowcount={ROW_COUNT}
						aria-colcount={COLUMN_COUNT}
						onScroll={(event) => {
							const target = event.currentTarget as HTMLDivElement;
							setScrollPosition({ left: target.scrollLeft, top: target.scrollTop });
						}}
					>
						<div
							class="grid-canvas"
							style={{
								width: columnVirtualizer.getTotalSize() + 'px',
								height: rowVirtualizer.getTotalSize() + 'px',
							}}
						>
							@for (const row of rowVirtualizer.getVirtualItems(); key row.key) {
								@for (const column of columnVirtualizer.getVirtualItems(); key column.key) {
									const address = { row: row.index, column: column.index };
									const key = cellKey(address);
									const label = addressLabel(address);
									const raw = readRaw(address);
									const display = displayCell(address, readRaw);
									const isSelected = selected.row === row.index && selected.column === column.index;
									const inRange = isInSelection(address, currentRange);
									<div
										ref={(element: HTMLElement | null) => {
											if (element === null) return;
											cellElementsRef.current.set(key, element);
											return () => {
												if (cellElementsRef.current.get(key) === element) {
													cellElementsRef.current.delete(key);
												}
											};
										}}
										class={[
											'grid-cell',
											isSelected && 'is-active',
											inRange && 'is-in-range',
											raw.startsWith('=') && 'is-formula',
											display.startsWith('#') && 'is-error',
										]}
										role="gridcell"
										aria-rowindex={row.index + 1}
										aria-colindex={column.index + 1}
										aria-selected={inRange ? 'true' : 'false'}
										aria-label={`${label}, ${display || 'blank'}`}
										data-cell={label}
										tabIndex={isSelected ? 0 : -1}
										style={{
											width: column.size + 'px',
											height: row.size + 'px',
											transform: `translate3d(${column.start}px, ${row.start}px, 0)`,
										}}
										onFocus={() => {
											if (!isSelected) {
												setSelected(address);
												setAnchor(address);
											}
										}}
										onClick={() => {
											setSelected(address);
											setAnchor(address);
										}}
										onDoubleClick={() => beginEditing(address)}
										onKeyDown={(event) => handleCellKeyDown(event, address)}
										onCopy={copySelection}
										onPaste={pasteSelection}
									>
										@if (editing?.row === row.index && editing?.column === column.index) {
											<input
												data-cell-editor
												aria-label={'Edit ' + label}
												value={editorDraft}
												maxLength={MAX_CELL_TEXT_LENGTH}
												spellCheck={false}
												onCompositionStart={() => {
													composingRef.current = true;
												}}
												onCompositionEnd={(event) => {
													composingRef.current = false;
													setEditorDraft((event.target as HTMLInputElement).value);
												}}
												onInput={(event) => setEditorDraft(
													(event.target as HTMLInputElement).value,
												)}
												onBlur={() => {
													if (skipBlurCommitRef.current) {
														skipBlurCommitRef.current = false;
													} else if (!composingRef.current) commitEditing();
												}}
												onKeyDown={(event) => {
													if (event.isComposing || composingRef.current) return;
													if (event.key === 'Enter') {
														event.preventDefault();
														skipBlurCommitRef.current = true;
														commitEditing({ row: row.index + 1, column: column.index });
													} else if (event.key === 'Tab') {
														event.preventDefault();
														skipBlurCommitRef.current = true;
														commitEditing({
															row: row.index,
															column: column.index + (event.shiftKey ? -1 : 1),
														});
													} else if (event.key === 'Escape') {
														event.preventDefault();
														skipBlurCommitRef.current = true;
														setEditing(null);
														focusAddress(address);
													}
												}}
											/>
										} @else {
											<span>{display as string}</span>
										}
									</div>
								}
							}
						</div>
					</div>
				</div>
			</main>

			<footer class="status-bar">
				<div role="status" aria-live="polite" data-testid="activity">{activity as string}</div>
				<div class="status-hints">
					<span>
						<kbd>Enter</kbd>
						edit
					</span>
					<span>
						<kbd>Shift</kbd>
						+ arrows select
					</span>
					<span>
						<kbd>Ctrl/⌘ C</kbd>
						copy
					</span>
					<strong>{ROW_COUNT.toLocaleString()} rows × {COLUMN_COUNT} columns</strong>
				</div>
			</footer>
		</div>
	}
}
