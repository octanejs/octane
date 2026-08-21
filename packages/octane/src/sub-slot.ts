/**
 * Formatting and identity options for binding-owned hook sub-slots.
 *
 * The defaults preserve the long-standing `parent:tag` global-symbol shape.
 * Bindings with an uncompiled-caller fallback can opt into a stable tag-only
 * symbol with `slotlessPrefix`; bindings that must distinguish two parent
 * symbols with the same description can set `global` to `false`.
 */
export interface SubSlotOptions {
	/** Text before the parent slot description. */
	parentPrefix?: string;
	/** Text between the parent slot description and the child tag. */
	tagPrefix?: string;
	/** Description used when a parent symbol has no description. */
	parentDescriptionFallback?: string;
	/** Text before a tag-only child; omitting it preserves an undefined parent. */
	slotlessPrefix?: string;
	/** Include the parent symbol's description in the child description. */
	includeParentDescription?: boolean;
	/** Use `Symbol.for`; set to false for factory-local child identities. */
	global?: boolean;
	/** Override global/local identity for tag-only children. */
	slotlessGlobal?: boolean;
}

export type SubSlot = (slot: symbol | undefined, tag: string) => symbol | undefined;
export type SlotlessSubSlot = (slot: symbol | undefined, tag: string) => symbol;

export function createSubSlot(
	options: SubSlotOptions & { slotlessPrefix: string },
): SlotlessSubSlot;
export function createSubSlot(options?: SubSlotOptions): SubSlot;
export function createSubSlot(options: SubSlotOptions = {}): SubSlot {
	const childSlots = new Map<symbol, Map<string, symbol>>();
	const slotlessSlots = options.slotlessPrefix === undefined ? null : new Map<string, symbol>();
	const parentPrefix = options.parentPrefix ?? '';
	const tagPrefix = options.tagPrefix ?? ':';
	const parentDescriptionFallback = options.parentDescriptionFallback ?? '';
	const includeParentDescription = options.includeParentDescription !== false;
	const makeSymbol: (description: string) => symbol =
		options.global === false ? Symbol : Symbol.for;
	const makeSlotlessSymbol: (description: string) => symbol =
		options.slotlessGlobal === false ||
		(options.slotlessGlobal === undefined && options.global === false)
			? Symbol
			: Symbol.for;

	return (slot, tag) => {
		if (slot === undefined) {
			if (slotlessSlots === null) return undefined;
			let child = slotlessSlots.get(tag);
			if (child === undefined) {
				child = makeSlotlessSymbol(options.slotlessPrefix! + tag);
				slotlessSlots.set(tag, child);
			}
			return child;
		}

		let byTag = childSlots.get(slot);
		if (byTag === undefined) childSlots.set(slot, (byTag = new Map()));
		let child = byTag.get(tag);
		if (child === undefined) {
			const parentDescription = includeParentDescription
				? (slot.description ?? parentDescriptionFallback)
				: '';
			child = makeSymbol(parentPrefix + parentDescription + tagPrefix + tag);
			byTag.set(tag, child);
		}
		return child;
	};
}

/** Default binding helper: global `parent:tag` children and no slotless fallback. */
export const subSlot = createSubSlot();
