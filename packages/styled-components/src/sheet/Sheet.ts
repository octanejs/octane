import { DISABLE_SPEEDY, IS_BROWSER, KEYFRAMES_ID_PREFIX } from '../constants';
import { InsertionTarget } from '../types';
import { EMPTY_OBJECT } from '../utils/empties';
import { setToString } from '../utils/setToString';
import { makeGroupedTag } from './GroupedTag';
import { getGroupForId } from './GroupIDAllocator';
import { emitChunk } from './octaneChannel';
import { getRehydrationContainer, outputSheet, rehydrateSheet } from './Rehydration';
import { makeTag } from './Tag';
import { GroupedTag, Sheet, SheetOptions } from './types';

let SHOULD_REHYDRATE = IS_BROWSER;

type SheetConstructorArgs = {
	isServer?: boolean;
	nonce?: string | undefined;
	useCSSOMInjection?: boolean;
	target?: InsertionTarget | undefined;
	capture?: boolean;
};

type GlobalStylesAllocationMap = {
	[key: string]: number;
};
type NamesAllocationMap = Map<string, Set<string>>;

const defaultOptions: SheetOptions = {
	isServer: !IS_BROWSER,
	useCSSOMInjection: !DISABLE_SPEEDY,
};

/** Contains the main stylesheet logic for stringification and caching */
export default class StyleSheet implements Sheet {
	gs: GlobalStylesAllocationMap;
	/** Keyframe component IDs for efficient RSC rendering (avoids scanning all names) */
	keyframeIds: Set<string>;
	names: NamesAllocationMap;
	options: SheetOptions;
	server: boolean;
	tag?: GroupedTag | undefined;

	/** Register a group ID to give it an index */
	static registerId(id: string): number {
		return getGroupForId(id);
	}

	constructor(
		options: SheetConstructorArgs = EMPTY_OBJECT as Object,
		globalStyles: GlobalStylesAllocationMap = {},
		names?: NamesAllocationMap | undefined,
	) {
		this.options = {
			...defaultOptions,
			...options,
		};

		this.gs = globalStyles;
		this.keyframeIds = new Set();
		this.names = new Map(names as NamesAllocationMap);
		// Read from the MERGED options: the zero-arg main sheet must pick up the
		// `isServer: !IS_BROWSER` default (upstream reads the raw argument here and
		// instead relies on a `__SERVER__` build define this port doesn't have).
		this.server = !!this.options.isServer;

		// We rehydrate only once and use the sheet that is created first
		if (!this.server && IS_BROWSER && SHOULD_REHYDRATE) {
			SHOULD_REHYDRATE = false;
			rehydrateSheet(this);
		}

		setToString(this, () => outputSheet(this));
	}

	rehydrate(): void {
		if (!this.server && IS_BROWSER) {
			rehydrateSheet(this);
		}
	}

	reconstructWithOptions(options: SheetConstructorArgs, withNames = true) {
		const newSheet = new StyleSheet(
			{ ...this.options, ...options },
			this.gs,
			(withNames && this.names) || undefined,
		);

		newSheet.keyframeIds = new Set(this.keyframeIds);

		// If we're reconstructing with a new target on the client, check if the container changed
		// This handles the case where StyleSheetManager's target prop changes (e.g., from undefined to shadowRoot)
		// We only rehydrate if the container (Document or ShadowRoot) actually changes
		if (!this.server && IS_BROWSER && options.target !== this.options.target) {
			const oldContainer = getRehydrationContainer(this.options.target);
			const newContainer = getRehydrationContainer(options.target);

			if (oldContainer !== newContainer) {
				rehydrateSheet(newSheet);
			}
		}

		return newSheet;
	}

	allocateGSInstance(id: string) {
		return (this.gs[id] = (this.gs[id] || 0) + 1);
	}

	/** Lazily initialises a GroupedTag for when it's actually needed */
	getTag() {
		return this.tag || (this.tag = makeGroupedTag(makeTag(this.options)));
	}

	/**
	 * Whether this is a phantom server sheet: every chunk forwards to octane's
	 * per-request css channel and nothing is retained, so the module-global
	 * main sheet cannot leak styles (or `names` state) across requests.
	 */
	isPhantom(): boolean {
		return this.server && !this.options.capture;
	}

	/** Check whether a name is known for caching */
	hasNameForId(id: string, name: string): boolean {
		// A phantom sheet must re-observe every chunk so each request's render
		// re-emits it into that request's css map (octane dedups within a pass).
		if (this.isPhantom()) return false;
		return this.names.get(id)?.has(name) ?? false;
	}

	/** Mark a group's name as known for caching */
	registerName(id: string, name: string) {
		getGroupForId(id);

		if (id.startsWith(KEYFRAMES_ID_PREFIX)) {
			this.keyframeIds.add(id);
		}

		const existing = this.names.get(id);
		if (existing) {
			existing.add(name);
		} else {
			this.names.set(id, new Set([name]));
		}
	}

	/** Insert new rules which also marks the name as known */
	insertRules(id: string, name: string, rules: string[]) {
		if (this.server) {
			emitChunk(id, name, rules);
			if (!this.options.capture) return;
		}
		this.registerName(id, name);
		this.getTag().insertRules(getGroupForId(id), rules);
	}

	/** Clears all cached names for a given group ID */
	clearNames(id: string) {
		if (this.names.has(id)) {
			(this.names.get(id) as any).clear();
		}
	}

	/** Clears all rules for a given group ID */
	clearRules(id: string) {
		if (this.isPhantom()) return;
		this.getTag().clearGroup(getGroupForId(id));
		this.clearNames(id);
	}

	/** Clears the entire tag which deletes all rules but not its names */
	clearTag() {
		// NOTE: This does not clear the names, since it's only used during SSR
		// so that we can continuously output only new rules
		this.tag = undefined;
	}
}
