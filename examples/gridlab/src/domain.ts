export const ROW_COUNT = 1_000;
export const COLUMN_COUNT = 80;
export const MAX_CELL_TEXT_LENGTH = 20_000;
export const WORKBOOK_STORAGE_KEY = 'gridlab:atlas-workbook:v1';

export interface CellAddress {
	row: number;
	column: number;
}

export interface SelectionRange {
	startRow: number;
	endRow: number;
	startColumn: number;
	endColumn: number;
}

export type StoredCellsResult =
	| { status: 'empty'; cells: Record<string, string> }
	| { status: 'restored'; cells: Record<string, string> }
	| { status: 'invalid'; cells: Record<string, string> }
	| { status: 'unavailable'; cells: Record<string, string> };

const INITIATIVES = [
	'Atlas launch',
	'Mobile renewal',
	'Search quality',
	'Partner portal',
	'Billing migration',
	'Onboarding refresh',
	'Analytics studio',
	'Support automation',
];
const OWNERS = ['Mira', 'Theo', 'Inez', 'Cal', 'Nora', 'Ari'];
const STATUSES = ['On track', 'At risk', 'Planned', 'In review'];

function emptyCells(): Record<string, string> {
	return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidStoredCell(key: string, value: unknown): value is string {
	if (typeof value !== 'string' || value.length > MAX_CELL_TEXT_LENGTH) return false;
	const match = /^(0|[1-9]\d*):(0|[1-9]\d*)$/.exec(key);
	if (!match) return false;
	const row = Number(match[1]);
	const column = Number(match[2]);
	return (
		Number.isSafeInteger(row) &&
		row >= 0 &&
		row < ROW_COUNT &&
		Number.isSafeInteger(column) &&
		column >= 0 &&
		column < COLUMN_COUNT
	);
}

function discardStoredWorkbook(): void {
	try {
		window.localStorage.removeItem(WORKBOOK_STORAGE_KEY);
	} catch {
		// A rejected cleanup must not stop the deterministic workbook from opening.
	}
}

export function readStoredCellValues(): StoredCellsResult {
	let source: string | null;
	try {
		source = window.localStorage.getItem(WORKBOOK_STORAGE_KEY);
	} catch {
		return { status: 'unavailable', cells: emptyCells() };
	}
	if (source === null) return { status: 'empty', cells: emptyCells() };

	try {
		const parsed: unknown = JSON.parse(source);
		if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.cells)) {
			discardStoredWorkbook();
			return { status: 'invalid', cells: emptyCells() };
		}
		const entries = Object.entries(parsed.cells);
		if (entries.length > ROW_COUNT * COLUMN_COUNT) {
			discardStoredWorkbook();
			return { status: 'invalid', cells: emptyCells() };
		}
		const cells: Record<string, string> = {};
		for (const [key, value] of entries) {
			if (!isValidStoredCell(key, value)) {
				discardStoredWorkbook();
				return { status: 'invalid', cells: emptyCells() };
			}
			cells[key] = value;
		}
		return { status: 'restored', cells };
	} catch {
		discardStoredWorkbook();
		return { status: 'invalid', cells: emptyCells() };
	}
}

export function writeStoredCellValues(cells: Record<string, string>): boolean {
	try {
		if (Object.keys(cells).length === 0) {
			window.localStorage.removeItem(WORKBOOK_STORAGE_KEY);
		} else {
			window.localStorage.setItem(WORKBOOK_STORAGE_KEY, JSON.stringify({ version: 1, cells }));
		}
		return true;
	} catch {
		return false;
	}
}

export function clampAddress(address: CellAddress): CellAddress {
	return {
		row: Math.max(0, Math.min(ROW_COUNT - 1, address.row)),
		column: Math.max(0, Math.min(COLUMN_COUNT - 1, address.column)),
	};
}

export function columnLabel(index: number): string {
	let value = index + 1;
	let label = '';
	while (value > 0) {
		const remainder = (value - 1) % 26;
		label = String.fromCharCode(65 + remainder) + label;
		value = Math.floor((value - 1) / 26);
	}
	return label;
}

export function addressLabel(address: CellAddress): string {
	return `${columnLabel(address.column)}${address.row + 1}`;
}

export function cellKey(address: CellAddress): string {
	return `${address.row}:${address.column}`;
}

export function parseAddress(value: string): CellAddress | null {
	const match = /^\s*([a-z]{1,3})([1-9]\d*)\s*$/i.exec(value);
	if (!match) return null;
	let column = 0;
	for (const letter of match[1].toUpperCase()) {
		column = column * 26 + letter.charCodeAt(0) - 64;
	}
	const address = { row: Number(match[2]) - 1, column: column - 1 };
	if (
		!Number.isSafeInteger(address.row) ||
		address.row < 0 ||
		address.row >= ROW_COUNT ||
		address.column < 0 ||
		address.column >= COLUMN_COUNT
	) {
		return null;
	}
	return address;
}

export function baseCellRaw(address: CellAddress): string {
	const number = address.row + 1;
	switch (address.column) {
		case 0:
			return INITIATIVES[address.row % INITIATIVES.length] + (address.row < 8 ? '' : ` ${number}`);
		case 1:
			return String(1_200 + ((address.row * 137) % 4_800));
		case 2:
			return String(430 + ((address.row * 89) % 2_900));
		case 3:
			return `=B${number}-C${number}`;
		case 4:
			return OWNERS[address.row % OWNERS.length];
		case 5:
			return STATUSES[address.row % STATUSES.length];
		default:
			return '';
	}
}

export function selectionRange(anchor: CellAddress, focus: CellAddress): SelectionRange {
	return {
		startRow: Math.min(anchor.row, focus.row),
		endRow: Math.max(anchor.row, focus.row),
		startColumn: Math.min(anchor.column, focus.column),
		endColumn: Math.max(anchor.column, focus.column),
	};
}

export function selectionSize(range: SelectionRange): number {
	return (range.endRow - range.startRow + 1) * (range.endColumn - range.startColumn + 1);
}

export function isInSelection(address: CellAddress, range: SelectionRange): boolean {
	return (
		address.row >= range.startRow &&
		address.row <= range.endRow &&
		address.column >= range.startColumn &&
		address.column <= range.endColumn
	);
}

export type RawCellReader = (address: CellAddress) => string;

function numericValue(
	address: CellAddress,
	readRaw: RawCellReader,
	stack: Set<string>,
): number | string {
	const key = cellKey(address);
	if (stack.has(key)) return '#CYCLE!';
	const raw = readRaw(address).trim();
	if (raw === '') return 0;
	if (!raw.startsWith('=')) {
		const number = Number(raw.replaceAll(',', ''));
		return Number.isFinite(number) ? number : '#VALUE!';
	}

	stack.add(key);
	const expression = raw.slice(1).trim();
	const sum = /^SUM\(([A-Z]{1,3}[1-9]\d*):([A-Z]{1,3}[1-9]\d*)\)$/i.exec(expression);
	if (sum) {
		const start = parseAddress(sum[1]);
		const end = parseAddress(sum[2]);
		if (!start || !end) {
			stack.delete(key);
			return '#REF!';
		}
		let total = 0;
		for (let row = Math.min(start.row, end.row); row <= Math.max(start.row, end.row); row++) {
			for (
				let column = Math.min(start.column, end.column);
				column <= Math.max(start.column, end.column);
				column++
			) {
				const value = numericValue({ row, column }, readRaw, stack);
				if (typeof value === 'string') {
					stack.delete(key);
					return value;
				}
				total += value;
			}
		}
		stack.delete(key);
		return total;
	}

	const binary =
		/^([A-Z]{1,3}[1-9]\d*|-?\d+(?:\.\d+)?)\s*([+\-*/])\s*([A-Z]{1,3}[1-9]\d*|-?\d+(?:\.\d+)?)$/i.exec(
			expression,
		);
	if (!binary) {
		stack.delete(key);
		return '#VALUE!';
	}
	const operand = (token: string): number | string => {
		const reference = parseAddress(token);
		return reference ? numericValue(reference, readRaw, stack) : Number(token);
	};
	const left = operand(binary[1]);
	const right = operand(binary[3]);
	if (typeof left === 'string' || typeof right === 'string') {
		stack.delete(key);
		return typeof left === 'string' ? left : right;
	}
	let result: number | string;
	switch (binary[2]) {
		case '+':
			result = left + right;
			break;
		case '-':
			result = left - right;
			break;
		case '*':
			result = left * right;
			break;
		default:
			result = right === 0 ? '#DIV/0!' : left / right;
	}
	stack.delete(key);
	return result;
}

export function displayCell(address: CellAddress, readRaw: RawCellReader): string {
	const raw = readRaw(address);
	if (!raw.trim().startsWith('=')) return raw;
	const result = numericValue(address, readRaw, new Set());
	if (typeof result === 'string') return result;
	return Number.isInteger(result) ? String(result) : String(Math.round(result * 100) / 100);
}
