export const FIXTURE_ROLE = 'bounded-native-list' as const;
export const FIXTURE_ID = 'octane-lynx-bounded-list-v1' as const;
export const LOGICAL_ROW_COUNT = 10_000;
export const VIEWPORT_WIDTH_PX = 390;
export const VIEWPORT_HEIGHT_PX = 640;
export const ESTIMATED_ROW_HEIGHT_PX = 40;
export const LIST_BUFFER_ROWS = 2;

export const LIST_CASE_IDS = ['list-startup', 'list-recycle', 'list-fling'] as const;
export type ListCaseId = (typeof LIST_CASE_IDS)[number];

export interface BoundedListRow {
	readonly id: string;
	readonly index: number;
	readonly label: string;
}

export interface AttachedCellObservation {
	readonly index: number;
	readonly itemKey: string;
}

export interface ListObservation {
	readonly scrollTop: number;
	readonly attachedCells: readonly AttachedCellObservation[];
}

export interface ListSemanticCheckpoint {
	readonly protocol: 'lynx-native-list-checkpoint-v1';
	readonly fixtureRole: typeof FIXTURE_ROLE;
	readonly fixtureId: typeof FIXTURE_ID;
	readonly caseId: ListCaseId;
	readonly logicalRowCount: number;
	readonly viewport: {
		readonly widthPx: number;
		readonly heightPx: number;
		readonly estimatedRowHeightPx: number;
		readonly leadingBufferRows: number;
		readonly trailingBufferRows: number;
	};
	readonly declaredCases: typeof LIST_CASE_IDS;
	readonly scrollTop: number;
	readonly attachedRows: readonly {
		readonly index: number;
		readonly itemKey: string;
		readonly expectedItemKey: string;
		readonly label: string;
	}[];
	readonly semantics: {
		readonly valid: boolean;
		readonly keysMatch: boolean;
		readonly indicesUnique: boolean;
		readonly contiguous: boolean;
		readonly startupAnchorPresent: boolean;
	};
}

export const ROWS: readonly BoundedListRow[] = Array.from(
	{ length: LOGICAL_ROW_COUNT },
	(_, index) => ({
		id: `row-${index}`,
		index,
		label: `Row ${index}`,
	}),
);

/**
 * Convert native attached-cell metadata into the semantic evidence shared by
 * the three device list cases. Native allocation remains an external metric.
 */
export function createListSemanticCheckpoint(
	caseId: ListCaseId,
	observation: ListObservation | null,
): ListSemanticCheckpoint | undefined {
	if (!(LIST_CASE_IDS as readonly string[]).includes(caseId) || observation === null) {
		return undefined;
	}
	const attachedCells = [...observation.attachedCells].sort(
		(left, right) => left.index - right.index,
	);
	if (attachedCells.length === 0) return undefined;
	const attachedRows = attachedCells.map(({ index, itemKey }) => {
		const expected = ROWS[index];
		return Object.freeze({
			index,
			itemKey,
			expectedItemKey: expected?.id ?? '',
			label: expected?.label ?? '',
		});
	});
	const keysMatch = attachedRows.every(
		(row) => row.expectedItemKey !== '' && row.itemKey === row.expectedItemKey,
	);
	const indicesUnique = new Set(attachedRows.map((row) => row.index)).size === attachedRows.length;
	const contiguous = attachedRows.every(
		(row, index) => index === 0 || row.index === attachedRows[index - 1]!.index + 1,
	);
	const startupAnchorPresent =
		caseId !== 'list-startup' || attachedRows.some((row) => row.index === 0);

	return Object.freeze({
		protocol: 'lynx-native-list-checkpoint-v1',
		fixtureRole: FIXTURE_ROLE,
		fixtureId: FIXTURE_ID,
		caseId,
		logicalRowCount: LOGICAL_ROW_COUNT,
		viewport: Object.freeze({
			widthPx: VIEWPORT_WIDTH_PX,
			heightPx: VIEWPORT_HEIGHT_PX,
			estimatedRowHeightPx: ESTIMATED_ROW_HEIGHT_PX,
			leadingBufferRows: LIST_BUFFER_ROWS,
			trailingBufferRows: LIST_BUFFER_ROWS,
		}),
		declaredCases: LIST_CASE_IDS,
		scrollTop: observation.scrollTop,
		attachedRows: Object.freeze(attachedRows),
		semantics: Object.freeze({
			valid: keysMatch && indicesUnique && contiguous && startupAnchorPresent,
			keysMatch,
			indicesUnique,
			contiguous,
			startupAnchorPresent,
		}),
	});
}
