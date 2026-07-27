// Public prop types and internal store/context types for @octanejs/cmdk.
// Mirrors cmdk@1.1.1's type surface (cmdk/src/index.tsx lines 10-152), adapted
// to octane: children are `OctaneNode`, refs are the octane `Ref` union, and
// host-element props come from octane's JSX intrinsics instead of React's
// `ComponentPropsWithoutRef<typeof Primitive.div>`. Each component's `ref` is
// declared explicitly (octane has no forwardRef), so the div/input bases have
// their intrinsic `ref` omitted.
import type { OctaneNode } from 'octane';
import type { Octane } from 'octane/jsx-runtime';

export type Ref<T> = ((value: T | null) => void) | { current: T | null } | null;

type Children = { children?: OctaneNode };
export type DivProps = Omit<Octane.JSX.IntrinsicElements['div'], 'ref'>;
type InputElementProps = Omit<Octane.JSX.IntrinsicElements['input'], 'ref'>;

export type LoadingProps = Children &
	DivProps & {
		ref?: Ref<HTMLDivElement>;
		/** Estimated progress of loading asynchronous options. */
		progress?: number;
		/** Accessible label for this loading progressbar. Not shown visibly. */
		label?: string;
	};

export type EmptyProps = Children & DivProps & { ref?: Ref<HTMLDivElement> };

export type SeparatorProps = DivProps & {
	ref?: Ref<HTMLDivElement>;
	/** Whether this separator should always be rendered. Useful if you disable automatic filtering. */
	alwaysRender?: boolean;
};

export type ListProps = Children &
	DivProps & {
		ref?: Ref<HTMLDivElement>;
		/** Accessible label for this List of suggestions. Not shown visibly. */
		label?: string;
	};

export type ItemProps = Children &
	Omit<DivProps, 'disabled' | 'onSelect' | 'value'> & {
		ref?: Ref<HTMLDivElement>;
		/** Whether this item is currently disabled. */
		disabled?: boolean;
		/** Event handler for when this item is selected, either via click or keyboard selection. */
		onSelect?: (value: string) => void;
		/**
		 * A unique value for this item. If no value is provided, it will be inferred
		 * from the rendered `textContent`. If your `textContent` changes between
		 * renders, you _must_ provide a stable, unique `value`.
		 */
		value?: string;
		/** Optional keywords to match against when filtering. */
		keywords?: string[];
		/** Whether this item is forcibly rendered regardless of filtering. */
		forceMount?: boolean;
	};

export type GroupProps = Children &
	Omit<DivProps, 'heading' | 'value'> & {
		ref?: Ref<HTMLDivElement>;
		/** Optional heading to render for this group. */
		heading?: OctaneNode;
		/** If no heading is provided, you must provide a value that is unique for this group. */
		value?: string;
		/** Whether this group is forcibly rendered regardless of filtering. */
		forceMount?: boolean;
	};

export type InputProps = Omit<InputElementProps, 'value' | 'onChange' | 'onInput' | 'type'> & {
	ref?: Ref<HTMLInputElement>;
	/** Optional controlled state for the value of the search input. */
	value?: string;
	/** Event handler called when the search value changes. */
	onValueChange?: (search: string) => void;
};

export type DialogProps = CommandProps & {
	/** Controlled open state of the dialog. */
	open?: boolean;
	/** Uncontrolled initial open state. */
	defaultOpen?: boolean;
	/** Called when the dialog requests to open or close. */
	onOpenChange?: (open: boolean) => void;
	/** Whether the dialog traps focus and blocks the page (default true). */
	modal?: boolean;
	/** className applied to the Dialog overlay. */
	overlayClassName?: string;
	/** className applied to the Dialog content. */
	contentClassName?: string;
	/** Custom element the Dialog should portal into. */
	container?: HTMLElement;
};

export type CommandFilter = (value: string, search: string, keywords?: string[]) => number;

export type CommandProps = Children &
	DivProps & {
		ref?: Ref<HTMLDivElement>;
		/** Accessible label for this command menu. Not shown visibly. */
		label?: string;
		/**
		 * Optionally set to `false` to turn off the automatic filtering and sorting.
		 * If `false`, you must conditionally render valid items based on the search
		 * query yourself.
		 */
		shouldFilter?: boolean;
		/**
		 * Custom filter function for whether each command menu item matches the
		 * given search query. Should return a number between 0 and 1, with 1 the
		 * best match and 0 hidden entirely. Defaults to the `command-score` scorer.
		 */
		filter?: CommandFilter;
		/** Optional default item value when it is initially rendered. */
		defaultValue?: string;
		/** Optional controlled state of the selected command menu item. */
		value?: string;
		/** Event handler called when the selected item of the menu changes. */
		onValueChange?: (value: string) => void;
		/** Optionally set to `true` to turn on looping when using the arrow keys. */
		loop?: boolean;
		/** Optionally set to `true` to disable selection via pointer events. */
		disablePointerSelection?: boolean;
		/** Set to `false` to disable ctrl+n/j/p/k shortcuts. Defaults to `true`. */
		vimBindings?: boolean;
	};

// Internal store/context shapes (cmdk/src/index.tsx lines 123-152).

export type State = {
	search: string;
	value: string;
	selectedItemId?: string;
	filtered: { count: number; items: Map<string, number>; groups: Set<string> };
	/**
	 * How many force-mounted items are live. They bypass registration and
	 * filtering entirely, so they never reach `filtered.count` — but they ARE on
	 * screen, and `Command.Empty` must not claim "no results" while one is
	 * visible. Kept separate from `filtered.count` so that count keeps its
	 * upstream meaning (items matching the current search) for `useCommandState`.
	 */
	forceMountedCount: number;
};

export type Store = {
	subscribe: (callback: () => void) => () => void;
	snapshot: () => State;
	setState: <K extends keyof State>(key: K, value: State[K], opts?: unknown) => void;
	emit: () => void;
};

export type Context = {
	value: (id: string, value: string | undefined, keywords?: string[]) => void;
	item: (id: string, groupId: string | undefined) => () => void;
	/** Registers a force-mounted item, which is exempt from filtering. */
	forceItem: (id: string) => () => void;
	group: (id: string) => () => void;
	filter: () => boolean;
	label: string;
	getDisablePointerSelection: () => boolean;
	listId: string;
	labelId: string;
	inputId: string;
	listInnerRef: { current: HTMLDivElement | null };
};

export type Group = {
	id: string;
	forceMount?: boolean;
};
