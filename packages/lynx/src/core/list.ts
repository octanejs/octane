export interface LynxListItemDescriptor {
	readonly id: number;
	readonly type: 'list-item';
	readonly itemKey: string;
	readonly reuseIdentifier: string;
	readonly recyclable: boolean;
	readonly defer: boolean;
}

export interface LynxListInsertAction {
	readonly position: number;
	readonly type: 'list-item';
	readonly 'item-key': string;
	readonly 'reuse-identifier'?: string;
	readonly recyclable?: false;
	readonly defer?: true;
}

export interface LynxListUpdateAction extends Omit<LynxListInsertAction, 'position'> {
	readonly from: number;
	readonly to: number;
	readonly flush: false;
}

/** Value consumed by Lynx's public `update-list-info` Element PAPI channel. */
export interface LynxListUpdateInfo {
	readonly insertAction: readonly LynxListInsertAction[];
	readonly removeAction: readonly number[];
	readonly updateAction: readonly LynxListUpdateAction[];
}

function listError(message: string): Error {
	return new TypeError(`Octane Lynx list: ${message}`);
}

/** Decode and validate the native metadata for one direct `<list-item>` child. */
export function createLynxListItemDescriptor(
	id: number,
	type: string,
	props: Readonly<Record<string, unknown>>,
): LynxListItemDescriptor {
	if (type !== 'list-item') {
		throw listError(`<list> child ${id} must be a <list-item>, received <${type}>.`);
	}
	const itemKey = props['item-key'];
	if (typeof itemKey !== 'string' || itemKey.length === 0) {
		throw listError(`<list-item> ${id} requires a non-empty string item-key.`);
	}
	const reuseIdentifier = props['reuse-identifier'];
	if (reuseIdentifier !== undefined && typeof reuseIdentifier !== 'string') {
		throw listError(`<list-item> ${id} reuse-identifier must be a string when present.`);
	}
	if (props.recyclable !== undefined && typeof props.recyclable !== 'boolean') {
		throw listError(`<list-item> ${id} recyclable must be a boolean when present.`);
	}
	if (props.defer !== undefined && typeof props.defer !== 'boolean') {
		throw listError(
			`<list-item> ${id} defer must be a boolean when present; ` +
				'the object form is intentionally unsupported because Octane retains logical component state and effects while native cells recycle.',
		);
	}
	return Object.freeze({
		id,
		type,
		itemKey,
		reuseIdentifier: reuseIdentifier ?? '',
		recyclable: props.recyclable !== false,
		defer: props.defer === true,
	});
}

function nativeMetadata(item: LynxListItemDescriptor): Omit<LynxListInsertAction, 'position'> {
	return Object.freeze({
		type: item.type,
		'item-key': item.itemKey,
		...(item.reuseIdentifier === '' ? null : { 'reuse-identifier': item.reuseIdentifier }),
		...(item.recyclable ? null : { recyclable: false as const }),
		...(item.defer ? { defer: true as const } : null),
	});
}

function sameMetadata(first: LynxListItemDescriptor, second: LynxListItemDescriptor): boolean {
	return (
		first.itemKey === second.itemKey &&
		first.reuseIdentifier === second.reuseIdentifier &&
		first.recyclable === second.recyclable &&
		first.defer === second.defer
	);
}

/** Stable physical reuse partition used by native list callbacks. */
export function lynxListReuseKey(item: LynxListItemDescriptor): string {
	return `${item.type}\u0000${item.reuseIdentifier}`;
}

/**
 * Return the IDs forming a longest increasing subsequence of old positions.
 * Those survivors need neither a native removal nor insertion during reorder.
 */
function stableSurvivors(
	previous: readonly LynxListItemDescriptor[],
	next: readonly LynxListItemDescriptor[],
): ReadonlySet<number> {
	const previousIndex = new Map(previous.map((item, index) => [item.id, index]));
	const entries: Array<{ readonly id: number; readonly index: number }> = [];
	for (const item of next) {
		const index = previousIndex.get(item.id);
		if (index !== undefined) entries.push({ id: item.id, index });
	}
	if (entries.length === 0) return new Set();

	const tails: number[] = [];
	const tailsEntry: number[] = [];
	const predecessors = new Array<number>(entries.length).fill(-1);
	for (let index = 0; index < entries.length; index++) {
		const value = entries[index]!.index;
		let low = 0;
		let high = tails.length;
		while (low < high) {
			const middle = (low + high) >>> 1;
			if (tails[middle]! < value) low = middle + 1;
			else high = middle;
		}
		if (low > 0) predecessors[index] = tailsEntry[low - 1]!;
		tails[low] = value;
		tailsEntry[low] = index;
	}

	const survivors = new Set<number>();
	let cursor = tailsEntry[tails.length - 1]!;
	while (cursor !== -1) {
		survivors.add(entries[cursor]!.id);
		cursor = predecessors[cursor]!;
	}
	return survivors;
}

/** Plan the minimal identity-preserving native list delta for one accepted commit. */
export function planLynxListUpdate(
	previous: readonly LynxListItemDescriptor[],
	next: readonly LynxListItemDescriptor[],
): LynxListUpdateInfo {
	const seenKeys = new Set<string>();
	for (const item of next) {
		if (seenKeys.has(item.itemKey)) {
			throw listError(`item-key ${JSON.stringify(item.itemKey)} is duplicated in one <list>.`);
		}
		seenKeys.add(item.itemKey);
	}

	const stable = stableSurvivors(previous, next);
	const nextById = new Map(next.map((item) => [item.id, item]));
	const previousById = new Map(previous.map((item) => [item.id, item]));
	const removeAction: number[] = [];
	for (let index = 0; index < previous.length; index++) {
		if (!stable.has(previous[index]!.id)) removeAction.push(index);
	}
	const insertAction: LynxListInsertAction[] = [];
	const updateAction: LynxListUpdateAction[] = [];
	for (let index = 0; index < next.length; index++) {
		const item = next[index]!;
		if (!stable.has(item.id)) {
			insertAction.push(Object.freeze({ position: index, ...nativeMetadata(item) }));
			continue;
		}
		const oldItem = previousById.get(item.id);
		if (oldItem !== undefined && !sameMetadata(oldItem, item)) {
			updateAction.push(
				Object.freeze({ from: index, to: index, flush: false, ...nativeMetadata(item) }),
			);
		}
	}
	for (const id of stable) {
		if (!nextById.has(id)) throw listError(`internal survivor ${id} is absent from the next list.`);
	}
	return Object.freeze({
		insertAction: Object.freeze(insertAction),
		removeAction: Object.freeze(removeAction),
		updateAction: Object.freeze(updateAction),
	});
}
