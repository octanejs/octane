// Ported from .base-ui/packages/react/src/menu/ (v1.6.0) — Phase 3f STAGES 1 + 2.
//
// STAGE 1, the open/close + roving-focus path: `store/MenuStore` + `store/MenuHandle`,
// `utils/findRootOwnerId` (in `./utils/findRootOwnerId`) + `utils/types`, `root/MenuRoot` +
// `root/MenuRootContext`, `trigger/`, `portal/`, `positioner/` and `popup/`. It is the first
// consumer of the Phase 3e list-navigation infrastructure: `MenuRoot` is where `useListNavigation`
// and `useTypeahead` get wired to a real popup store, and `Menu.Positioner` wraps the popup in the
// `CompositeList` those hooks read their element/label refs from.
//
// STAGE 2, the item family and the remaining popup parts: `utils/stateAttributesMapping`
// (`itemMapping`), `item/` (`useMenuItemCommonProps` + `useMenuItem` + `MenuItem`), `link-item/`,
// `checkbox-item/` + `checkbox-item-indicator/`, `radio-group/` + `radio-item/` +
// `radio-item-indicator/`, `group/` + `group-label/`, `arrow/`, `backdrop/` and `viewport/`. This
// is where the 3e infrastructure is finally exercised end-to-end: items register themselves with
// the positioner's `CompositeList`, so `useListNavigation` can rove `data-highlighted` between
// them and `useTypeahead` can match their labels.
//
// `Menu.Separator` re-exports the shared `Separator` exactly as upstream `menu/index.parts.ts`
// does — it is not a Menu-specific part.
//
// STAGE 3, submenus: `submenu-root/` (`MenuSubmenuRoot` + the `MenuSubmenuRootContext` stage 1
// already declared) and `submenu-trigger/`. `MenuSubmenuTrigger` is the piece that finally uses the
// `submenu-trigger` arm of `useMenuItem`'s `itemMetadata`, and it activates the sibling-close /
// parent-close / item-hover relays `MenuPositioner` has carried inertly since stage 1: it is
// simultaneously an ITEM of the parent menu (parent's `CompositeList`, `itemProps`, `isActive`) and
// the TRIGGER of its own menu, so it holds both stores at once.
//
// `Menubar` and `ContextMenu` land in stage 4.
//
// octane adaptations:
//   - components are `createElement`, not JSX; `forwardRef` → ref-as-prop; each component takes its
//     per-call-site slot from `S('…')` and derives every composed hook's slot via `subSlot`;
//   - native, delegated events — `event.nativeEvent` collapses to `event`, and
//     `event.isPropagationStopped()` (React-synthetic-only) becomes a `cancelBubble` read;
//   - `React.createContext`/`useContext` → octane's; `React.useImperativeHandle` → octane's;
//   - `useIsoLayoutEffect` → octane `useLayoutEffect`; `useMergedRefs` → `useComposedRefs`;
//   - `fastComponent`/`fastComponentRef` (React fiber fast paths) are dropped — plain functions,
//     as is the `React.memo` wrapper on `MenuRadioGroup` (octane memoizes renders itself and the
//     wrapper carries no behavioral contract);
//   - this package carries NO `process.env.NODE_ENV` branches, so upstream's dev-only warning for
//     `modal` on a nested menu is dropped (same call as the rest of the binding). `useControlled`
//     likewise takes no `name`/`state` labels here — they exist only for dev warnings.
//
// STAGING NOTE: the `menubar` / `context-menu` / `nested-context-menu` arms of `MenuParent` are
// transcribed verbatim even though no component provides those contexts yet — see
// `./utils/MenubarContext` and `./utils/ContextMenuRootContext`. Keeping the branches means stage 4
// only has to add the components, not re-thread `Menu`'s parent logic.
import {
	createContext,
	createElement,
	Fragment,
	useContext,
	useMemo,
	useRef,
	useEffect,
	useLayoutEffect,
	useCallback,
	useState,
	useImperativeHandle,
	useId,
	isChildrenBlock,
} from 'octane';

import { S, subSlot } from './internal';
import { Separator } from './separator';
import { useRenderElement } from './utils/useRenderElement';
import { mergeProps } from './utils/mergeProps';
import { useButton } from './utils/useButton';
import { useBaseUiId } from './utils/useBaseUiId';
import { useStableCallback } from './utils/useStableCallback';
import { useControlled } from './utils/useControlled';
import { useRefWithInit } from './utils/useRefWithInit';
import { useTimeout } from './utils/useTimeout';
import { useComposedRefs } from './utils/composeRefs';
import { useTransitionStatus } from './utils/useTransitionStatus';
import { usePopupViewport } from './utils/usePopupViewport';
import { useCompositeListItem } from './utils/composite/useCompositeListItem';
import { platform } from './utils/platform';
import {
	createChangeEventDetails,
	REASONS,
	type BaseUIChangeEventDetails,
} from './utils/createChangeEventDetails';
import { EMPTY_ARRAY, EMPTY_OBJECT } from './utils/empty';
import { ReactStore } from './utils/store/ReactStore';
import { createSelector } from './utils/store/createSelector';
import { ownerDocument } from './utils/owner';
import { contains } from './utils/contains';
import { inertValue } from './utils/inertValue';
import { getPseudoElementBounds } from './utils/getPseudoElementBounds';
import { getDisabledMountTransitionStyles } from './utils/getDisabledMountTransitionStyles';
import { useMixedToggleClickHandler } from './utils/useMixedToggleClickHandler';
import { useOpenInteractionType } from './utils/useOpenInteractionType';
import { useOpenChangeComplete } from './utils/useOpenChangeComplete';
import { useAnimationsFinished } from './utils/useAnimationsFinished';
import { useAnchoredPopupScrollLock } from './utils/useAnchoredPopupScrollLock';
import { usePositioner } from './utils/usePositioner';
import { InternalBackdrop } from './utils/InternalBackdrop';
import { adaptiveOrigin } from './utils/adaptiveOriginMiddleware';
import { findRootOwnerId } from './utils/findRootOwnerId';
import { useDirection } from './utils/DirectionContext';
import {
	DROPDOWN_COLLISION_AVOIDANCE,
	POPUP_COLLISION_AVOIDANCE,
	PATIENT_CLICK_THRESHOLD,
	TYPEAHEAD_RESET_MS,
} from './utils/constants';
import {
	popupStateMapping,
	pressableTriggerOpenStateMapping,
	triggerOpenStateMapping,
} from './utils/popupStateMapping';
import { transitionStatusMapping } from './utils/useTransitionStatus';
import type { TransitionStatus } from './utils/useTransitionStatus';
import type { StateAttributesMapping } from './utils/getStateAttributesProps';
import { COMPOSITE_KEYS } from './utils/composite/keys';
import { CompositeList } from './utils/composite/CompositeList';
import { CompositeItem } from './utils/composite/CompositeItem';
import { useCompositeRootContext } from './utils/CompositeRootContext';
import {
	useAnchorPositioning,
	type Align,
	type Side,
	type UseAnchorPositioningSharedParameters,
} from './utils/useAnchorPositioning';
import { useClick } from './utils/floating/useClick';
import { useFocus } from './utils/floating/useFocus';
import { useDismiss } from './utils/floating/useDismiss';
import { useListNavigation } from './utils/floating/useListNavigation';
import { useTypeahead } from './utils/floating/useTypeahead';
import {
	safePolygon,
	useHoverReferenceInteraction,
} from './utils/floating/useHoverReferenceInteraction';
import { useHoverFloatingInteraction } from './utils/floating/useHoverFloatingInteraction';
import { useSyncedFloatingRootContext } from './utils/floating/useSyncedFloatingRootContext';
import { FloatingFocusManager } from './utils/floating/FloatingFocusManager';
import { FloatingPortal } from './utils/floating/FloatingPortal';
import { FocusGuard } from './utils/floating/FocusGuard';
import {
	FloatingTree,
	FloatingNode,
	FloatingTreeStore,
	useFloatingNodeId,
	useFloatingParentNodeId,
	useFloatingTree,
} from './utils/floating/FloatingTree';
import { useMenubarContext } from './utils/MenubarContext';
import type { MenubarContextValue } from './utils/MenubarContext';
import { useContextMenuRootContext } from './utils/ContextMenuRootContext';
import type { ContextMenuRootContextValue } from './utils/ContextMenuRootContext';
import {
	attachPreventUnmountOnClose,
	createInitialPopupStoreState,
	popupStoreSelectors,
	setPopupOpenState,
	useImplicitActiveTrigger,
	useInitialOpenSync,
	useOpenStateTransitions,
	usePopupInteractionProps,
	useTriggerDataForwarding,
	useTriggerRegistration,
	FOCUSABLE_POPUP_PROPS,
	PopupTriggerMap,
	type PopupStoreContext,
	type PopupStoreState,
} from './utils/popups';
import { useTriggerFocusGuards } from './utils/popups/useTriggerFocusGuards';
import type { InteractionType } from './utils/useEnhancedClickHandler';

// How far outside the trigger's (pseudo-element-inclusive) bounds a mouseup still counts as "on the
// trigger" and therefore does not cancel a hover-opened menu.
const BOUNDARY_OFFSET = 2;

type HTMLProps = Record<string, any>;

// --- Parent ------------------------------------------------------------------

export type MenuRootOrientation = 'horizontal' | 'vertical';

/**
 * What a `Menu.Root` is nested inside. `undefined` is a standalone dropdown menu; `menu` is a
 * submenu; `menubar`/`context-menu` are provided by components that land in stage 4.
 */
export type MenuParent =
	| {
			type: 'menu';
			store: MenuStore<unknown>;
	  }
	| {
			type: 'menubar';
			context: MenubarContextValue;
	  }
	| {
			type: 'context-menu';
			context: ContextMenuRootContextValue;
	  }
	| {
			type: 'nested-context-menu';
			context: ContextMenuRootContextValue;
			menuContext: MenuRootContextValue;
	  }
	| {
			type: undefined;
	  };

export type MenuRootChangeEventReason =
	| typeof REASONS.triggerHover
	| typeof REASONS.triggerFocus
	| typeof REASONS.triggerPress
	| typeof REASONS.outsidePress
	| typeof REASONS.focusOut
	| typeof REASONS.listNavigation
	| typeof REASONS.escapeKey
	| typeof REASONS.itemPress
	| typeof REASONS.closePress
	| typeof REASONS.siblingOpen
	| typeof REASONS.cancelOpen
	| typeof REASONS.imperativeAction
	| typeof REASONS.none;

/** What `Menu.Root`'s `onOpenChange` receives. `preventUnmountOnClose` is attached per-dispatch. */
export type MenuRootChangeEventDetails = BaseUIChangeEventDetails<MenuRootChangeEventReason> & {
	preventUnmountOnClose(): void;
};

export interface MenuOpenEventDetails {
	open: boolean;
	reason: MenuRootChangeEventReason | null;
	nodeId: string | undefined;
	parentNodeId: string | null;
}

// --- Store -------------------------------------------------------------------

export type MenuState<Payload> = PopupStoreState<Payload> & {
	disabled: boolean;
	modal: boolean;
	openMethod: InteractionType | null;
	allowMouseEnter: boolean;
	highlightItemOnHover: boolean;
	parent: MenuParent;
	rootId: string | undefined;
	activeIndex: number | null;
	hoverEnabled: boolean;
	stickIfOpen: boolean;
	instantType: 'dismiss' | 'click' | 'group' | 'trigger-change' | undefined;
	openChangeReason: MenuRootChangeEventReason | null;
	floatingTreeRoot: FloatingTreeStore;
	floatingNodeId: string | undefined;
	floatingParentNodeId: string | null;
	itemProps: HTMLProps;
	closeDelay: number;
	keyboardEventRelay: ((event: any) => void) | undefined;
	hasViewport: boolean;
};

type MenuContext = PopupStoreContext<any> & {
	readonly positionerRef: { current: HTMLElement | null };
	readonly popupRef: { current: HTMLElement | null };
	readonly typingRef: { current: boolean };
	readonly itemDomElements: { current: Array<HTMLElement | null> };
	readonly itemLabels: { current: Array<string | null> };
	allowMouseUpTriggerRef: { current: boolean };
	readonly triggerFocusTargetRef: { current: HTMLElement | null };
	readonly beforeContentFocusGuardRef: { current: HTMLElement | null };
};

const menuSelectors = {
	...popupStoreSelectors,
	disabled: createSelector((state: MenuState<unknown>) =>
		state.parent.type === 'menubar'
			? state.parent.context.disabled || state.disabled
			: state.disabled,
	),
	modal: createSelector(
		(state: MenuState<unknown>) =>
			(state.parent.type === undefined || state.parent.type === 'context-menu') &&
			(state.modal ?? true),
	),
	openMethod: createSelector((state: MenuState<unknown>) => state.openMethod),
	allowMouseEnter: createSelector((state: MenuState<unknown>) => state.allowMouseEnter),
	highlightItemOnHover: createSelector((state: MenuState<unknown>) => state.highlightItemOnHover),
	stickIfOpen: createSelector((state: MenuState<unknown>) => state.stickIfOpen),
	parent: createSelector((state: MenuState<unknown>) => state.parent),
	rootId: createSelector((state: MenuState<unknown>): string | undefined => {
		if (state.parent.type === 'menu') {
			return state.parent.store.select('rootId');
		}

		return state.parent.type !== undefined ? state.parent.context.rootId : state.rootId;
	}),
	activeIndex: createSelector((state: MenuState<unknown>) => state.activeIndex),
	isActive: createSelector(
		(state: MenuState<unknown>, itemIndex: number) => state.activeIndex === itemIndex,
	),
	hoverEnabled: createSelector((state: MenuState<unknown>) => state.hoverEnabled),
	instantType: createSelector((state: MenuState<unknown>) => state.instantType),
	lastOpenChangeReason: createSelector((state: MenuState<unknown>) => state.openChangeReason),
	floatingTreeRoot: createSelector((state: MenuState<unknown>): FloatingTreeStore => {
		if (state.parent.type === 'menu') {
			return state.parent.store.select('floatingTreeRoot');
		}

		return state.floatingTreeRoot;
	}),
	floatingNodeId: createSelector((state: MenuState<unknown>) => state.floatingNodeId),
	floatingParentNodeId: createSelector((state: MenuState<unknown>) => state.floatingParentNodeId),
	itemProps: createSelector((state: MenuState<unknown>) => state.itemProps),
	closeDelay: createSelector((state: MenuState<unknown>) => state.closeDelay),
	hasViewport: createSelector((state: MenuState<unknown>) => state.hasViewport),
	keyboardEventRelay: createSelector(
		(state: MenuState<unknown>): ((event: any) => void) | undefined => {
			if (state.keyboardEventRelay) {
				return state.keyboardEventRelay;
			}

			if (state.parent.type === 'menu') {
				return state.parent.store.select('keyboardEventRelay');
			}

			return undefined;
		},
	),
};

function createInitialMenuState<Payload>(): MenuState<Payload> {
	return {
		...createInitialPopupStoreState<Payload>(),
		disabled: false,
		modal: true,
		openMethod: null,
		allowMouseEnter: false,
		highlightItemOnHover: true,
		stickIfOpen: true,
		parent: {
			type: undefined,
		},
		rootId: undefined,
		activeIndex: null,
		hoverEnabled: true,
		instantType: undefined,
		openChangeReason: null,
		floatingTreeRoot: new FloatingTreeStore(),
		floatingNodeId: undefined,
		floatingParentNodeId: null,
		itemProps: EMPTY_OBJECT as HTMLProps,
		keyboardEventRelay: undefined,
		closeDelay: 0,
		hasViewport: false,
	};
}

export class MenuStore<Payload> extends ReactStore<
	Readonly<MenuState<Payload>>,
	MenuContext,
	typeof menuSelectors
> {
	private unsubscribeParentListener: (() => void) | null = null;

	constructor(initialState?: Partial<MenuState<Payload>>) {
		super(
			{ ...createInitialMenuState<Payload>(), ...initialState },
			{
				positionerRef: { current: null },
				popupRef: { current: null },
				typingRef: { current: false },
				itemDomElements: { current: [] },
				itemLabels: { current: [] },
				allowMouseUpTriggerRef: { current: false },
				triggerFocusTargetRef: { current: null },
				beforeContentFocusGuardRef: { current: null },
				onOpenChangeComplete: undefined,
				triggerElements: new PopupTriggerMap(),
			} as MenuContext,
			menuSelectors,
		);

		// Set up propagation of state from parent menu if applicable.
		this.unsubscribeParentListener = this.observe('parent', (parent: MenuParent) => {
			this.unsubscribeParentListener?.();

			if (parent.type === 'menu') {
				let rootId = parent.store.select('rootId');
				let floatingTreeRoot = parent.store.select('floatingTreeRoot');
				let keyboardEventRelay = parent.store.select('keyboardEventRelay');

				this.unsubscribeParentListener = parent.store.subscribe(() => {
					const nextRootId = parent.store.select('rootId');
					const nextFloatingTreeRoot = parent.store.select('floatingTreeRoot');
					const nextKeyboardEventRelay = parent.store.select('keyboardEventRelay');

					if (
						rootId === nextRootId &&
						floatingTreeRoot === nextFloatingTreeRoot &&
						keyboardEventRelay === nextKeyboardEventRelay
					) {
						return;
					}

					rootId = nextRootId;
					floatingTreeRoot = nextFloatingTreeRoot;
					keyboardEventRelay = nextKeyboardEventRelay;
					this.notifyAll();
				});

				this.context.allowMouseUpTriggerRef = parent.store.context.allowMouseUpTriggerRef;
				return;
			}

			if (parent.type !== undefined) {
				this.context.allowMouseUpTriggerRef = parent.context.allowMouseUpTriggerRef;
			}

			this.unsubscribeParentListener = null;
		});
	}

	// Routed through the floating root context's event bus rather than applied directly, so that
	// `Menu.Root` owns the one `setOpen` implementation even when the caller is a DETACHED trigger
	// (or `MenuHandle`) that only holds the store.
	setOpen(open: boolean, eventDetails: any): void {
		(this.state.floatingRootContext as any).context.events.emit('setOpen', { open, eventDetails });
	}

	static useStore<Payload>(
		externalStore: MenuStore<Payload> | undefined,
		initialState: Partial<MenuState<Payload>>,
		slot: symbol | undefined,
	): MenuStore<Payload> {
		const internalStore = useRefWithInit<MenuStore<Payload>>(
			() => new MenuStore<Payload>(initialState),
			subSlot(slot, 'ref'),
		).current;

		return externalStore ?? internalStore;
	}
}

// --- Handle ------------------------------------------------------------------

export class MenuHandle<Payload> {
	/** Internal store holding the menu's state. */
	readonly store: MenuStore<Payload>;

	constructor() {
		this.store = new MenuStore<Payload>();
	}

	/**
	 * Opens the menu and associates it with the trigger with the given id. The trigger must be a
	 * `Menu.Trigger` with this handle passed as a prop.
	 */
	open(triggerId: string) {
		const triggerElement = triggerId
			? (this.store.context.triggerElements.getById(triggerId) as HTMLElement | undefined)
			: undefined;

		if (triggerId && !triggerElement) {
			throw new Error(`Base UI: MenuHandle.open: No trigger found with id "${triggerId}".`);
		}

		this.store.setOpen(
			true,
			createChangeEventDetails(REASONS.imperativeAction, undefined, triggerElement),
		);
	}

	/** Closes the menu. */
	close() {
		this.store.setOpen(
			false,
			createChangeEventDetails(REASONS.imperativeAction, undefined, undefined),
		);
	}

	/** Indicates whether the menu is currently open. */
	get isOpen() {
		return this.store.select('open');
	}
}

/** Creates a new handle to connect a `Menu.Root` with detached `Menu.Trigger` components. */
export function createMenuHandle<Payload>(): MenuHandle<Payload> {
	return new MenuHandle<Payload>();
}

// --- Contexts ----------------------------------------------------------------

export interface MenuRootContextValue<Payload = unknown> {
	store: MenuStore<Payload>;
	parent: MenuParent;
}

const MenuRootContext = createContext<MenuRootContextValue | undefined>(undefined);

export function useMenuRootContext(optional?: false): MenuRootContextValue;
export function useMenuRootContext(optional: true): MenuRootContextValue | undefined;
export function useMenuRootContext(optional?: boolean): MenuRootContextValue | undefined {
	const context = useContext(MenuRootContext);
	if (context === undefined && !optional) {
		throw new Error(
			'Base UI: MenuRootContext is missing. Menu parts must be placed within <Menu.Root>.',
		);
	}

	return context;
}

export interface MenuSubmenuRootContextValue {
	parentMenu: MenuStore<unknown>;
}

// Provided by `Menu.SubmenuRoot` (stage 3). Until then nothing provides it, so a `Menu.Root` nested
// inside another `Menu.Root` is NOT treated as a submenu — matching upstream, where the submenu
// relationship is established by `SubmenuRoot`, not by DOM nesting.
export const MenuSubmenuRootContext = createContext<MenuSubmenuRootContextValue | undefined>(
	undefined,
);

export function useMenuSubmenuRootContext(): MenuSubmenuRootContextValue | undefined {
	return useContext(MenuSubmenuRootContext);
}

const MenuPortalContext = createContext<boolean | undefined>(undefined);

export function useMenuPortalContext(): boolean {
	const value = useContext(MenuPortalContext);
	if (value === undefined) {
		throw new Error('Base UI: <Menu.Portal> is missing.');
	}
	return value;
}

export interface MenuPositionerContextValue {
	side: Side;
	align: Align;
	arrowRef: { current: Element | null };
	arrowUncentered: boolean;
	arrowStyles: Record<string, any>;
	context: any;
}

const MenuPositionerContext = createContext<MenuPositionerContextValue | undefined>(undefined);

export function useMenuPositionerContext(optional?: false): MenuPositionerContextValue;
export function useMenuPositionerContext(optional: true): MenuPositionerContextValue | undefined;
export function useMenuPositionerContext(
	optional?: boolean,
): MenuPositionerContextValue | undefined {
	const context = useContext(MenuPositionerContext);
	if (!context && !optional) {
		throw new Error(
			'Base UI: MenuPositionerContext is missing. Menu parts must be placed within <Menu.Positioner>.',
		);
	}
	return context;
}

// --- Root --------------------------------------------------------------------

function MenuRoot<Payload>(props: any): any {
	const slot = S('MenuRoot');
	const {
		children,
		open: openProp,
		onOpenChange,
		onOpenChangeComplete,
		defaultOpen = false,
		disabled: disabledProp = false,
		modal: modalProp,
		loopFocus = true,
		orientation = 'vertical',
		actionsRef,
		closeParentOnEsc = false,
		handle,
		triggerId: triggerIdProp,
		defaultTriggerId: defaultTriggerIdProp = null,
		highlightItemOnHover = true,
	} = props;

	const contextMenuContext = useContextMenuRootContext(true);
	const parentMenuRootContext = useMenuRootContext(true);
	const menubarContext = useMenubarContext(true);
	const isSubmenu = useMenuSubmenuRootContext();

	const parentFromContext: MenuParent = useMemo(
		() => {
			if (isSubmenu && parentMenuRootContext) {
				return {
					type: 'menu',
					store: parentMenuRootContext.store,
				};
			}

			if (menubarContext) {
				return {
					type: 'menubar',
					context: menubarContext,
				};
			}

			// Ensure this is not a Menu nested inside ContextMenu.Trigger. ContextMenu's
			// parentContext is always undefined as ContextMenu.Root is instantiated with
			// <MenuRootContext.Provider value={undefined}>.
			if (contextMenuContext && !parentMenuRootContext) {
				return {
					type: 'context-menu',
					context: contextMenuContext,
				};
			}

			return {
				type: undefined,
			};
		},
		[contextMenuContext, parentMenuRootContext, menubarContext, isSubmenu],
		subSlot(slot, 'parent'),
	);

	const store = MenuStore.useStore<Payload>(
		handle?.store,
		{
			open: defaultOpen,
			openProp,
			activeTriggerId: defaultTriggerIdProp,
			triggerIdProp,
			parent: parentFromContext,
		} as Partial<MenuState<Payload>>,
		subSlot(slot, 'store'),
	);

	useInitialOpenSync(
		store as any,
		openProp,
		defaultOpen,
		defaultTriggerIdProp,
		subSlot(slot, 'ios'),
	);

	store.useControlledProp('openProp', openProp, subSlot(slot, 'cp-open'));
	store.useControlledProp('triggerIdProp', triggerIdProp, subSlot(slot, 'cp-tid'));

	store.useContextCallback('onOpenChangeComplete', onOpenChangeComplete, subSlot(slot, 'cc'));

	// Raw `useId` (no `base-ui-` prefix), matching Base UI's `@base-ui/utils/useId`.
	const rootId = useId(subSlot(slot, 'rootId'));
	const floatingId = useId(subSlot(slot, 'floatingId'));
	const floatingTreeRoot = store.useState('floatingTreeRoot', subSlot(slot, 'ftr'));
	const floatingNodeIdFromContext = useFloatingNodeId(floatingTreeRoot, subSlot(slot, 'nodeId'));
	const floatingParentNodeIdFromContext = useFloatingParentNodeId();

	const open = store.useState('open', subSlot(slot, 'open'));
	const activeTriggerElement = store.useState('activeTriggerElement', subSlot(slot, 'ate'));
	const positionerElement = store.useState('positionerElement', subSlot(slot, 'posEl'));
	const hoverEnabled = store.useState('hoverEnabled', subSlot(slot, 'he'));
	const disabled = store.useState('disabled', subSlot(slot, 'disabled'));
	const lastOpenChangeReason = store.useState('lastOpenChangeReason', subSlot(slot, 'locr'));
	const parent = store.useState('parent', subSlot(slot, 'p'));

	const activeIndex = store.useState('activeIndex', subSlot(slot, 'ai'));
	const payload = store.useState('payload', subSlot(slot, 'payload')) as Payload | undefined;
	const floatingParentNodeId = store.useState('floatingParentNodeId', subSlot(slot, 'fpni'));

	const openEventRef = useRef<Event | null>(null, subSlot(slot, 'oer'));
	const allowOutsidePressDismissalRef = useRef(
		parent.type !== 'context-menu',
		subSlot(slot, 'aopdr'),
	);
	const allowOutsidePressDismissalTimeout = useTimeout(subSlot(slot, 'aopdt'));
	const allowTouchToCloseRef = useRef(true, subSlot(slot, 'attcr'));
	const allowTouchToCloseTimeout = useTimeout(subSlot(slot, 'attct'));

	const nested = floatingParentNodeId != null;

	const { openMethod, triggerProps: interactionTypeProps } = useOpenInteractionType(
		open,
		subSlot(slot, 'oit'),
	);

	store.useSyncedValues(
		{
			disabled: disabledProp,
			highlightItemOnHover,
			modal: parent.type === undefined ? modalProp : undefined,
			openMethod,
			rootId,
		} as Partial<MenuState<Payload>>,
		subSlot(slot, 'sv'),
	);

	useImplicitActiveTrigger(store as any, {}, subSlot(slot, 'iat'));
	const { forceUnmount } = useOpenStateTransitions(
		open,
		store as any,
		() => {
			store.update({ allowMouseEnter: false, stickIfOpen: true });
		},
		subSlot(slot, 'ost'),
	);

	useLayoutEffect(
		() => {
			if (contextMenuContext && !parentMenuRootContext) {
				// This is a context menu root. It doesn't support detached triggers yet, so we have
				// to sync the parent context manually.
				store.update({
					parent: {
						type: 'context-menu',
						context: contextMenuContext,
					},
					floatingNodeId: floatingNodeIdFromContext,
					floatingParentNodeId: floatingParentNodeIdFromContext,
				});
			} else if (parentMenuRootContext) {
				store.update({
					floatingNodeId: floatingNodeIdFromContext,
					floatingParentNodeId: floatingParentNodeIdFromContext,
				});
			}
		},
		[
			contextMenuContext,
			parentMenuRootContext,
			floatingNodeIdFromContext,
			floatingParentNodeIdFromContext,
			store,
		],
		subSlot(slot, 'e:parentSync'),
	);

	useEffect(
		() => {
			if (!open) {
				openEventRef.current = null;
			}

			if (parent.type !== 'context-menu') {
				return;
			}

			if (!open) {
				allowOutsidePressDismissalTimeout.clear();
				allowOutsidePressDismissalRef.current = false;
				return;
			}

			// With `mousedown` outside press events and long press touch input, there needs to be a
			// grace period after opening to ensure the dismissal event doesn't fire immediately
			// after open.
			allowOutsidePressDismissalTimeout.start(500, () => {
				allowOutsidePressDismissalRef.current = true;
			});
		},
		[allowOutsidePressDismissalTimeout, open, parent.type],
		subSlot(slot, 'e:outsidePress'),
	);

	useLayoutEffect(
		() => {
			if (!open && !hoverEnabled) {
				store.set('hoverEnabled', true);
			}
		},
		[open, hoverEnabled, store],
		subSlot(slot, 'e:hover'),
	);

	const setOpen = useStableCallback(
		(nextOpen: boolean, eventDetails: any) => {
			const reason = eventDetails.reason;

			if (
				open === nextOpen &&
				eventDetails.trigger === activeTriggerElement &&
				lastOpenChangeReason === reason
			) {
				return;
			}

			const shouldPreventUnmountOnClose = attachPreventUnmountOnClose(eventDetails);

			// Do not immediately reset the activeTriggerId to allow exit animations to play and
			// focus to be returned correctly.
			if (!nextOpen && eventDetails.trigger == null) {
				eventDetails.trigger = activeTriggerElement ?? undefined;
			}

			onOpenChange?.(nextOpen, eventDetails);

			if (eventDetails.isCanceled) {
				return;
			}

			(store.state.floatingRootContext as any).dispatchOpenChange(nextOpen, eventDetails);

			const nativeEvent = eventDetails.event as Event;
			if (
				nextOpen === false &&
				nativeEvent?.type === 'click' &&
				(nativeEvent as PointerEvent).pointerType === 'touch' &&
				!allowTouchToCloseRef.current
			) {
				return;
			}

			// Prevent the menu from closing on mobile devices that have a delayed click event. In
			// some cases the menu, when tapped, will fire the focus event first and then the click
			// event. Without this guard, the menu will close immediately after opening.
			if (nextOpen && reason === REASONS.triggerFocus) {
				allowTouchToCloseRef.current = false;
				allowTouchToCloseTimeout.start(300, () => {
					allowTouchToCloseRef.current = true;
				});
			} else {
				allowTouchToCloseRef.current = true;
				allowTouchToCloseTimeout.clear();
			}

			const isKeyboardClick =
				(reason === REASONS.triggerPress || reason === REASONS.itemPress) &&
				(nativeEvent as MouseEvent).detail === 0 &&
				nativeEvent?.isTrusted;
			const isDismissClose = !nextOpen && (reason === REASONS.escapeKey || reason == null);

			const updatedState: Partial<MenuState<Payload>> = {
				open: nextOpen,
				openChangeReason: reason,
			};
			openEventRef.current = eventDetails.event ?? null;

			setPopupOpenState(
				updatedState as any,
				nextOpen,
				eventDetails.trigger,
				shouldPreventUnmountOnClose(),
			);

			store.update(updatedState);

			if (
				parent.type === 'menubar' &&
				(reason === REASONS.triggerFocus ||
					reason === REASONS.focusOut ||
					reason === REASONS.triggerHover ||
					reason === REASONS.listNavigation ||
					reason === REASONS.siblingOpen)
			) {
				store.set('instantType', 'group');
			} else if (isKeyboardClick || isDismissClose) {
				store.set('instantType', isKeyboardClick ? 'click' : 'dismiss');
			} else {
				store.set('instantType', undefined);
			}
		},
		subSlot(slot, 'setOpen'),
	);

	const floatingRootContext = useSyncedFloatingRootContext(
		{
			popupStore: store as any,
			floatingId,
			nested: floatingParentNodeIdFromContext != null,
			onOpenChange: setOpen,
		},
		subSlot(slot, 'sfrc'),
	);

	const floatingEvents = (floatingRootContext as any).context.events;

	useEffect(
		() => {
			const handleSetOpenEvent = ({
				open: nextOpen,
				eventDetails,
			}: {
				open: boolean;
				eventDetails: any;
			}) => setOpen(nextOpen, eventDetails);

			floatingEvents.on('setOpen', handleSetOpenEvent);

			return () => {
				floatingEvents?.off('setOpen', handleSetOpenEvent);
			};
		},
		[floatingEvents, setOpen],
		subSlot(slot, 'e:setOpen'),
	);

	const handleImperativeClose = useCallback(
		() => {
			store.setOpen(false, createChangeEventDetails(REASONS.imperativeAction));
		},
		[store],
		subSlot(slot, 'close'),
	);

	useImperativeHandle(
		actionsRef,
		() => ({ unmount: forceUnmount, close: handleImperativeClose }),
		[forceUnmount, handleImperativeClose],
		subSlot(slot, 'imp'),
	);

	let ctx: ContextMenuRootContextValue | undefined;
	if (parent.type === 'context-menu') {
		ctx = parent.context;
	}

	useImperativeHandle(
		ctx?.positionerRef,
		() => positionerElement,
		[positionerElement],
		subSlot(slot, 'imp-pos'),
	);

	useImperativeHandle(ctx?.actionsRef, () => ({ setOpen }), [setOpen], subSlot(slot, 'imp-act'));

	const dismiss = useDismiss(
		floatingRootContext,
		{
			enabled: !disabled,
			bubbles: { escapeKey: closeParentOnEsc && parent.type === 'menu' },
			outsidePress() {
				if (parent.type !== 'context-menu' || openEventRef.current?.type === 'contextmenu') {
					return true;
				}

				return allowOutsidePressDismissalRef.current;
			},
			externalTree: nested ? floatingTreeRoot : undefined,
		},
		subSlot(slot, 'dismiss'),
	);

	const direction = useDirection();

	const setActiveIndex = useCallback(
		(index: number | null) => {
			if (store.select('activeIndex') === index) {
				return;
			}
			store.set('activeIndex', index);
		},
		[store],
		subSlot(slot, 'sai'),
	);

	const listNavigation = useListNavigation(
		floatingRootContext,
		{
			enabled: !disabled,
			listRef: store.context.itemDomElements,
			activeIndex,
			nested: parent.type !== undefined,
			loopFocus,
			orientation,
			parentOrientation: parent.type === 'menubar' ? parent.context.orientation : undefined,
			rtl: direction === 'rtl',
			disabledIndices: EMPTY_ARRAY,
			onNavigate: setActiveIndex,
			openOnArrowKeyDown: parent.type !== 'context-menu',
			externalTree: nested ? floatingTreeRoot : undefined,
			focusItemOnHover: highlightItemOnHover,
		},
		subSlot(slot, 'listNav'),
	);

	const onTyping = useCallback(
		(nextTyping: boolean) => {
			store.context.typingRef.current = nextTyping;
		},
		[store],
		subSlot(slot, 'onTyping'),
	);

	const typeahead = useTypeahead(
		floatingRootContext,
		{
			enabled: !disabled,
			listRef: store.context.itemLabels,
			elementsRef: store.context.itemDomElements,
			activeIndex,
			resetMs: TYPEAHEAD_RESET_MS,
			onMatch: (index: number) => {
				if (open && index !== activeIndex) {
					store.set('activeIndex', index);
				}
			},
			onTyping,
		},
		subSlot(slot, 'typeahead'),
	);

	const activeTriggerProps = useMemo(
		() => {
			const mergedProps = mergeProps(
				typeahead.reference,
				listNavigation.reference,
				dismiss.reference,
				{
					onMouseMove() {
						store.set('allowMouseEnter', true);
					},
				},
				interactionTypeProps,
			);

			mergedProps['aria-haspopup'] = 'menu';
			mergedProps['aria-expanded'] = open;

			return mergedProps;
		},
		[
			store,
			typeahead.reference,
			listNavigation.reference,
			dismiss.reference,
			interactionTypeProps,
			open,
		],
		subSlot(slot, 'atp'),
	);

	const inactiveTriggerProps = useMemo(
		() => {
			const mergedProps = mergeProps(listNavigation.trigger, dismiss.trigger, interactionTypeProps);

			mergedProps['aria-haspopup'] = 'menu';
			mergedProps['aria-expanded'] = false;

			return mergedProps;
		},
		[listNavigation.trigger, dismiss.trigger, interactionTypeProps],
		subSlot(slot, 'itp'),
	);

	const popupProps = useMemo(
		() =>
			mergeProps(
				FOCUSABLE_POPUP_PROPS,
				{
					id: floatingId,
					role: 'menu' as const,
					'aria-labelledby': activeTriggerElement?.id,
					onMouseMove() {
						store.set('allowMouseEnter', true);
						if (parent.type === 'menu') {
							store.set('hoverEnabled', false);
						}
					},
					onClick() {
						if (store.select('hoverEnabled')) {
							store.set('hoverEnabled', false);
						}
					},
					onKeyDown(event: KeyboardEvent) {
						// The Menubar's CompositeRoot captures keyboard events via event
						// delegation. This works well when Menu.Root is nested inside Menubar, but
						// with detached triggers we need to manually forward the event to the
						// CompositeRoot.
						//
						// octane dispatches NATIVE events, so React's
						// `event.isPropagationStopped()` becomes a `cancelBubble` read — the
						// standard flag `stopPropagation()` sets on a native event.
						const relay = store.select('keyboardEventRelay');
						if (relay && !event.cancelBubble) {
							relay(event);
						}
					},
				},
				typeahead.floating,
				listNavigation.floating,
				dismiss.floating,
			),
		[
			activeTriggerElement,
			floatingId,
			parent.type,
			store,
			typeahead.floating,
			listNavigation.floating,
			dismiss.floating,
		],
		subSlot(slot, 'pp'),
	);

	const itemProps = listNavigation.item ?? EMPTY_OBJECT;

	// `floatingRootContext` is INSTALLED ON THE STORE here (`usePopupInteractionProps` syncs its
	// whole state part), and this is the only place it happens. Menu deliberately differs from
	// Dialog/Popover/Tooltip, which build one in the store constructor and hand it to
	// `usePopupStore`: a Menu's store may be an EXTERNAL `MenuHandle` store shared with triggers
	// rendered outside this Root, so the context has to be created by the Root that owns `setOpen`
	// and published from there. Until this effect runs, `store.state.floatingRootContext` is the
	// inert placeholder from `createInitialPopupStoreState` — the same one-render window upstream
	// `MenuRoot.tsx` has, since it installs the context the identical way.
	//
	// Every store reader depends on this: `MenuTrigger`'s useClick/useFocus/hover, `MenuPositioner`'s
	// anchoring, `MenuPopup`'s focus manager, and `MenuStore.setOpen` — which emits on this
	// context's event bus so a detached trigger or `MenuHandle` reaches this Root's `setOpen`.
	// Pinned by the detached-trigger/handle tests in `tests/menu.test.ts`: dropping this one field
	// fails six of them.
	usePopupInteractionProps(
		store as any,
		{
			floatingRootContext,
			activeTriggerProps,
			inactiveTriggerProps,
			popupProps,
			itemProps,
		} as any,
		subSlot(slot, 'pip'),
	);

	const context: MenuRootContextValue<Payload> = useMemo(
		() => ({
			store,
			parent: parentFromContext,
		}),
		[store, parentFromContext],
		subSlot(slot, 'ctx'),
	);

	const resolvedChildren =
		typeof children === 'function' && !isChildrenBlock(children) ? children({ payload }) : children;

	const content = createElement(MenuRootContext.Provider, {
		value: context as MenuRootContextValue,
		children: resolvedChildren,
	});

	if (parent.type === undefined || parent.type === 'context-menu') {
		// Set up a FloatingTree to provide the context to nested menus.
		return createElement(FloatingTree, { externalTree: floatingTreeRoot, children: content });
	}

	return content;
}

// --- Trigger -----------------------------------------------------------------

function useMenuParent(slot: symbol | undefined): MenuParent {
	const contextMenuContext = useContextMenuRootContext(true);
	const parentContext = useMenuRootContext(true);
	const menubarContext = useMenubarContext(true);

	return useMemo(
		(): MenuParent => {
			if (menubarContext) {
				return {
					type: 'menubar',
					context: menubarContext,
				};
			}

			// Ensure this is not a Menu nested inside ContextMenu.Trigger.
			if (contextMenuContext && !parentContext) {
				return {
					type: 'context-menu',
					context: contextMenuContext,
				};
			}

			return {
				type: undefined,
			};
		},
		[contextMenuContext, parentContext, menubarContext],
		subSlot(slot, 'parent'),
	);
}

/** Determines whether to ignore clicks after a hover-open. */
function useStickIfOpen(open: boolean, openReason: string | null, slot: symbol | undefined) {
	const stickIfOpenTimeout = useTimeout(subSlot(slot, 'to'));
	const [stickIfOpen, setStickIfOpen] = useState(false, subSlot(slot, 's'));

	useLayoutEffect(
		() => {
			if (open && openReason === REASONS.triggerHover) {
				// Only allow "patient" clicks to close the menu if it's open. If they clicked
				// within 500ms of the menu opening, keep it open.
				setStickIfOpen(true);
				stickIfOpenTimeout.start(PATIENT_CLICK_THRESHOLD, () => {
					setStickIfOpen(false);
				});
			} else if (!open) {
				stickIfOpenTimeout.clear();
				setStickIfOpen(false);
			}
		},
		[open, openReason, stickIfOpenTimeout],
		subSlot(slot, 'e'),
	);

	return stickIfOpen;
}

function MenuTrigger(componentProps: any): any {
	const slot = S('MenuTrigger');
	const {
		render,
		className,
		style,
		disabled: disabledProp = false,
		nativeButton = true,
		id: idProp,
		openOnHover: openOnHoverProp,
		delay = 100,
		closeDelay = 0,
		handle,
		payload,
		ref: forwardedRef,
		...elementProps
	} = componentProps;

	const rootContext = useMenuRootContext(true);
	const store = (handle?.store ?? rootContext?.store) as MenuStore<any> | undefined;
	if (!store) {
		throw new Error(
			'Base UI: <Menu.Trigger> must be either used within a <Menu.Root> component or provided with a handle.',
		);
	}

	const thisTriggerId = useBaseUiId(idProp, subSlot(slot, 'id'));
	const isTriggerActive = store.useState('isTriggerActive', subSlot(slot, 'ita'), thisTriggerId);
	const floatingRootContext = store.useState('floatingRootContext', subSlot(slot, 'frc'));
	const isOpenedByThisTrigger = store.useState(
		'isOpenedByTrigger',
		subSlot(slot, 'obt'),
		thisTriggerId,
	);
	const popupId = store.useState('triggerPopupId', subSlot(slot, 'tpid'), thisTriggerId);

	const triggerElementRef = useRef<HTMLElement | null>(null, subSlot(slot, 'ter'));

	const parent = useMenuParent(subSlot(slot, 'mp'));
	const compositeRootContext = useCompositeRootContext(true);
	const floatingTreeRootFromContext = useFloatingTree();
	const floatingTreeRoot = useMemo(
		() => (floatingTreeRootFromContext as FloatingTreeStore | null) ?? new FloatingTreeStore(),
		[floatingTreeRootFromContext],
		subSlot(slot, 'ftr'),
	);

	const floatingNodeId = useFloatingNodeId(floatingTreeRoot, subSlot(slot, 'nodeId'));
	const floatingParentNodeId = useFloatingParentNodeId();

	const { registerTrigger, isMountedByThisTrigger } = useTriggerDataForwarding(
		thisTriggerId,
		triggerElementRef,
		store as any,
		{
			payload,
			closeDelay,
			parent,
			floatingTreeRoot,
			floatingNodeId,
			floatingParentNodeId,
			keyboardEventRelay: (compositeRootContext as any)?.relayKeyboardEvent,
		} as any,
		subSlot(slot, 'tdf'),
	);

	const isInMenubar = parent.type === 'menubar';

	const rootDisabled = store.useState('disabled', subSlot(slot, 'rd'));
	const disabled =
		disabledProp || rootDisabled || (isInMenubar && (parent as any).context.disabled);

	const { getButtonProps, buttonRef } = useButton(
		{ disabled, native: nativeButton },
		subSlot(slot, 'btn'),
	);

	useEffect(
		() => {
			if (!isOpenedByThisTrigger && parent.type === undefined) {
				store.context.allowMouseUpTriggerRef.current = false;
			}
		},
		[store, isOpenedByThisTrigger, parent.type],
		subSlot(slot, 'e:allowMouseUp'),
	);

	const triggerRef = useRef<HTMLElement | null>(null, subSlot(slot, 'tr'));
	const allowMouseUpTriggerTimeout = useTimeout(subSlot(slot, 'amutt'));

	const handleDocumentMouseUp = useStableCallback(
		(mouseEvent: MouseEvent) => {
			if (!triggerRef.current) {
				return;
			}

			allowMouseUpTriggerTimeout.clear();
			store.context.allowMouseUpTriggerRef.current = false;

			const mouseUpTarget = mouseEvent.target as Element | null;

			if (
				contains(triggerRef.current, mouseUpTarget) ||
				contains(store.select('positionerElement'), mouseUpTarget) ||
				mouseUpTarget === triggerRef.current
			) {
				return;
			}

			if (mouseUpTarget != null && findRootOwnerId(mouseUpTarget) === store.select('rootId')) {
				return;
			}

			const bounds = getPseudoElementBounds(triggerRef.current);

			if (
				mouseEvent.clientX >= bounds.left - BOUNDARY_OFFSET &&
				mouseEvent.clientX <= bounds.right + BOUNDARY_OFFSET &&
				mouseEvent.clientY >= bounds.top - BOUNDARY_OFFSET &&
				mouseEvent.clientY <= bounds.bottom + BOUNDARY_OFFSET
			) {
				return;
			}

			floatingTreeRoot.events.emit('close', {
				domEvent: mouseEvent,
				reason: REASONS.cancelOpen,
			});
		},
		subSlot(slot, 'hdmu'),
	);

	useEffect(
		() => {
			if (isOpenedByThisTrigger && store.select('lastOpenChangeReason') === REASONS.triggerHover) {
				const doc = ownerDocument(triggerRef.current);
				doc.addEventListener('mouseup', handleDocumentMouseUp, { once: true });
			}
		},
		[isOpenedByThisTrigger, handleDocumentMouseUp, store],
		subSlot(slot, 'e:mouseup'),
	);

	const parentMenubarHasSubmenuOpen = isInMenubar && (parent as any).context.hasSubmenuOpen;
	const openOnHover = openOnHoverProp ?? parentMenubarHasSubmenuOpen;

	const hoverProps = useHoverReferenceInteraction(
		floatingRootContext,
		{
			enabled:
				openOnHover &&
				!disabled &&
				parent.type !== 'context-menu' &&
				(!isInMenubar || (parentMenubarHasSubmenuOpen && !isMountedByThisTrigger)),
			handleClose: safePolygon({ blockPointerEvents: !isInMenubar }),
			mouseOnly: true,
			move: false,
			restMs: parent.type === undefined ? delay : undefined,
			delay: { close: closeDelay },
			triggerElementRef,
			externalTree: floatingTreeRoot,
			isActiveTrigger: isTriggerActive,
			isClosing: () => store.select('transitionStatus') === 'ending',
		},
		subSlot(slot, 'hover'),
	);

	// Whether to ignore clicks to open the menu. `lastOpenChangeReason` doesn't need to be reactive
	// here, as we need to run this only when `isOpenedByThisTrigger` changes.
	const stickIfOpen = useStickIfOpen(
		isOpenedByThisTrigger,
		store.select('lastOpenChangeReason'),
		subSlot(slot, 'sio'),
	);

	const click = useClick(
		floatingRootContext,
		{
			enabled: !disabled && parent.type !== 'context-menu',
			event: isOpenedByThisTrigger && isInMenubar ? 'click' : 'mousedown',
			toggle: true,
			ignoreMouse: false,
			stickIfOpen: parent.type === undefined ? stickIfOpen : false,
		},
		subSlot(slot, 'click'),
	);

	const focus = useFocus(
		floatingRootContext,
		{ enabled: !disabled && parentMenubarHasSubmenuOpen },
		subSlot(slot, 'focus'),
	);

	const mixedToggleHandlers = useMixedToggleClickHandler(
		{
			open: isOpenedByThisTrigger,
			enabled: isInMenubar,
			mouseDownAction: 'open',
		},
		subSlot(slot, 'mixed'),
	);

	const localInteractionProps = useMemo(
		() => mergeProps(focus.reference, click.reference),
		[focus.reference, click.reference],
		subSlot(slot, 'lip'),
	);

	const rootTriggerProps = store.useState(
		'triggerProps',
		subSlot(slot, 'tp'),
		isMountedByThisTrigger,
	);

	const { preFocusGuardRef, handlePreFocusGuardFocus, handleFocusTargetFocus } =
		useTriggerFocusGuards(store as any, triggerElementRef, subSlot(slot, 'tfg'));

	const state: MenuTriggerState = {
		disabled,
		open: isOpenedByThisTrigger,
	};

	const refs = [triggerRef, forwardedRef, buttonRef, registerTrigger, triggerElementRef];
	const props = [
		localInteractionProps,
		hoverProps ?? EMPTY_OBJECT,
		rootTriggerProps,
		{
			'aria-haspopup': 'menu' as const,
			'aria-controls': popupId,
			id: thisTriggerId,
			onMouseDown: (event: MouseEvent) => {
				if (store.select('open')) {
					return;
				}

				// mousedown -> mouseup on menu item should not trigger it within 200ms.
				allowMouseUpTriggerTimeout.start(200, () => {
					store.context.allowMouseUpTriggerRef.current = true;
				});

				const doc = ownerDocument(event.currentTarget as Element);
				doc.addEventListener('mouseup', handleDocumentMouseUp, { once: true });
			},
		},
		isInMenubar ? { role: 'menuitem' } : {},
		mixedToggleHandlers,
		elementProps,
		getButtonProps,
	];

	const element = useRenderElement(
		'button',
		componentProps,
		{
			enabled: !isInMenubar,
			stateAttributesMapping: pressableTriggerOpenStateMapping,
			state,
			ref: refs,
			props,
		},
		subSlot(slot, 're'),
	);

	if (isInMenubar) {
		return createElement(CompositeItem, {
			tag: 'button',
			render,
			className,
			style,
			state,
			refs,
			props,
			stateAttributesMapping: pressableTriggerOpenStateMapping,
		});
	}

	// A fragment with key is required to ensure that the `element` is mounted to the same DOM node
	// regardless of whether the focus guards are rendered or not. (octane reconciles a returned
	// array as a keyed list, so the guards carry stable keys too — otherwise the unkeyed siblings
	// shift the keyed trigger and it is rebuilt anyway. Same fix as Popover.Trigger.)
	const keyedElement = createElement(Fragment, { key: thisTriggerId, children: element });

	if (isOpenedByThisTrigger) {
		return [
			createElement(FocusGuard, {
				key: `${thisTriggerId}-pre-focus-guard`,
				ref: preFocusGuardRef,
				onFocus: handlePreFocusGuardFocus,
			}),
			keyedElement,
			createElement(FocusGuard, {
				key: `${thisTriggerId}-post-focus-guard`,
				ref: store.context.triggerFocusTargetRef,
				onFocus: handleFocusTargetFocus,
			}),
		];
	}

	return keyedElement;
}

export interface MenuTriggerState {
	/** Whether the menu is currently open and was opened by this trigger. */
	open: boolean;
	/** Whether the trigger is disabled. */
	disabled: boolean;
}

// --- Portal ------------------------------------------------------------------

function MenuPortal(props: any): any {
	const slot = S('MenuPortal');
	const { keepMounted = false, ref, ...portalProps } = props;

	const { store } = useMenuRootContext() as MenuRootContextValue;
	const mounted = store.useState('mounted', subSlot(slot, 'mounted'));

	const shouldRender = mounted || keepMounted;
	if (!shouldRender) {
		return null;
	}

	return createElement(MenuPortalContext.Provider, {
		value: keepMounted,
		children: createElement(FloatingPortal, { ref, ...portalProps }),
	});
}

// --- Positioner --------------------------------------------------------------

function MenuPositioner(componentProps: any): any {
	const slot = S('MenuPositioner');
	const {
		anchor: anchorProp,
		positionMethod: positionMethodProp = 'absolute',
		className,
		render,
		side,
		align: alignProp,
		sideOffset: sideOffsetProp = 0,
		alignOffset: alignOffsetProp = 0,
		collisionBoundary = 'clipping-ancestors',
		collisionPadding = 5,
		arrowPadding = 5,
		sticky = false,
		disableAnchorTracking = false,
		collisionAvoidance: collisionAvoidanceProp = DROPDOWN_COLLISION_AVOIDANCE,
		style,
		ref: forwardedRef,
		...elementProps
	} = componentProps;

	const { store } = useMenuRootContext() as MenuRootContextValue;

	const keepMounted = useMenuPortalContext();
	const contextMenuContext = useContextMenuRootContext(true);

	const parent = store.useState('parent', subSlot(slot, 'parent'));
	const floatingRootContext = store.useState('floatingRootContext', subSlot(slot, 'frc'));
	const floatingTreeRoot = store.useState('floatingTreeRoot', subSlot(slot, 'ftr'));
	const mounted = store.useState('mounted', subSlot(slot, 'mounted'));
	const open = store.useState('open', subSlot(slot, 'open'));
	const modal = store.useState('modal', subSlot(slot, 'modal'));
	const openMethod = store.useState('openMethod', subSlot(slot, 'method'));
	const triggerElement = store.useState('activeTriggerElement', subSlot(slot, 'trigger'));
	const transitionStatus = store.useState('transitionStatus', subSlot(slot, 'trans'));
	const positionerElement = store.useState('positionerElement', subSlot(slot, 'posEl'));
	const instantType = store.useState('instantType', subSlot(slot, 'instant'));
	const hasViewport = store.useState('hasViewport', subSlot(slot, 'viewport'));
	const lastOpenChangeReason = store.useState('lastOpenChangeReason', subSlot(slot, 'locr'));
	const floatingNodeId = store.useState('floatingNodeId', subSlot(slot, 'nodeId'));
	const floatingParentNodeId = store.useState('floatingParentNodeId', subSlot(slot, 'parentId'));
	const domReference = floatingRootContext.useState('domReferenceElement', subSlot(slot, 'domRef'));

	const previousTriggerRef = useRef<Element | null>(null, subSlot(slot, 'prevTrigger'));
	const runOnceAnimationsFinish = useAnimationsFinished(
		positionerElement,
		false,
		false,
		subSlot(slot, 'anim'),
	);

	let anchor = anchorProp;
	let sideOffset = sideOffsetProp;
	let alignOffset = alignOffsetProp;
	let align = alignProp;
	let collisionAvoidance = collisionAvoidanceProp;
	if (parent.type === 'context-menu') {
		anchor = anchorProp ?? parent.context?.anchor;
		align = align ?? 'start';
		if (!side && align !== 'center') {
			alignOffset = componentProps.alignOffset ?? 2;
			sideOffset = componentProps.sideOffset ?? -5;
		}
	}

	let computedSide = side;
	let computedAlign = align;
	if (parent.type === 'menu') {
		computedSide = computedSide ?? 'inline-end';
		computedAlign = computedAlign ?? 'start';
		collisionAvoidance = componentProps.collisionAvoidance ?? POPUP_COLLISION_AVOIDANCE;
	} else if (parent.type === 'menubar') {
		computedSide =
			computedSide ?? (parent.context.orientation === 'vertical' ? 'inline-end' : 'bottom');
		computedAlign = computedAlign ?? 'start';
	}

	const contextMenu = parent.type === 'context-menu';

	const positioner = useAnchorPositioning(
		{
			anchor,
			floatingRootContext,
			positionMethod: contextMenuContext ? 'fixed' : positionMethodProp,
			mounted,
			side: computedSide,
			sideOffset,
			align: computedAlign,
			alignOffset,
			arrowPadding: contextMenu ? 0 : arrowPadding,
			collisionBoundary,
			collisionPadding,
			sticky,
			nodeId: floatingNodeId,
			keepMounted,
			disableAnchorTracking,
			collisionAvoidance,
			shiftCrossAxis:
				contextMenu && !('side' in collisionAvoidance && collisionAvoidance.side === 'flip'),
			externalTree: floatingTreeRoot,
			adaptiveOrigin: hasViewport ? adaptiveOrigin : undefined,
		},
		subSlot(slot, 'positioning'),
	);

	useEffect(
		() => {
			function onMenuOpenChange(details: MenuOpenEventDetails) {
				if (details.open) {
					if (details.parentNodeId === floatingNodeId) {
						store.set('hoverEnabled', false);
					}
					if (
						details.nodeId !== floatingNodeId &&
						details.parentNodeId === store.select('floatingParentNodeId')
					) {
						store.setOpen(false, createChangeEventDetails(REASONS.siblingOpen));
					}
				}
			}

			floatingTreeRoot.events.on('menuopenchange', onMenuOpenChange);

			return () => {
				floatingTreeRoot.events.off('menuopenchange', onMenuOpenChange);
			};
		},
		[store, floatingTreeRoot.events, floatingNodeId],
		subSlot(slot, 'e:openChange'),
	);

	useEffect(
		() => {
			if (store.select('floatingParentNodeId') == null) {
				return undefined;
			}

			function onParentClose(details: MenuOpenEventDetails) {
				if (details.open || details.nodeId !== store.select('floatingParentNodeId')) {
					return;
				}

				const reason: MenuRootChangeEventReason = details.reason ?? REASONS.siblingOpen;
				store.setOpen(false, createChangeEventDetails(reason));
			}

			floatingTreeRoot.events.on('menuopenchange', onParentClose);

			return () => {
				floatingTreeRoot.events.off('menuopenchange', onParentClose);
			};
		},
		[floatingTreeRoot.events, store],
		subSlot(slot, 'e:parentClose'),
	);

	const closeTimeout = useTimeout(subSlot(slot, 'closeTimeout'));

	// Clear pending close timeout when the menu closes.
	useEffect(
		() => {
			if (!open) {
				closeTimeout.clear();
			}
		},
		[open, closeTimeout],
		subSlot(slot, 'e:clearClose'),
	);

	// Close unrelated child submenus when hovering a different item in the parent menu.
	useEffect(
		() => {
			function onItemHover(event: { nodeId: string | undefined; target: Element | null }) {
				// If an item within our parent menu is hovered, and this menu's trigger is not that
				// item, close this submenu. This ensures hovering a different item in the parent
				// closes other branches.
				if (!open || event.nodeId !== store.select('floatingParentNodeId')) {
					return;
				}

				if (event.target && triggerElement && triggerElement !== event.target) {
					const delay = store.select('closeDelay');
					if (delay > 0) {
						if (!closeTimeout.isStarted()) {
							closeTimeout.start(delay, () => {
								store.setOpen(false, createChangeEventDetails(REASONS.siblingOpen));
							});
						}
					} else {
						store.setOpen(false, createChangeEventDetails(REASONS.siblingOpen));
					}
				} else {
					// User re-hovered the submenu trigger, cancel pending close.
					closeTimeout.clear();
				}
			}

			floatingTreeRoot.events.on('itemhover', onItemHover);
			return () => {
				floatingTreeRoot.events.off('itemhover', onItemHover);
			};
		},
		[floatingTreeRoot.events, open, triggerElement, store, closeTimeout],
		subSlot(slot, 'e:itemHover'),
	);

	useEffect(
		() => {
			const eventDetails: MenuOpenEventDetails = {
				open,
				nodeId: floatingNodeId,
				parentNodeId: floatingParentNodeId,
				reason: store.select('lastOpenChangeReason'),
			};

			floatingTreeRoot.events.emit('menuopenchange', eventDetails);
		},
		[floatingTreeRoot.events, open, store, floatingNodeId, floatingParentNodeId],
		subSlot(slot, 'e:emit'),
	);

	// Keep positioner transition behavior aligned with Popover when switching detached triggers.
	useLayoutEffect(
		() => {
			const currentTrigger = domReference;
			const previousTrigger = previousTriggerRef.current;

			if (currentTrigger) {
				previousTriggerRef.current = currentTrigger;
			}

			if (previousTrigger && currentTrigger && currentTrigger !== previousTrigger) {
				store.set('instantType', undefined);

				const abortController = new AbortController();
				runOnceAnimationsFinish(() => {
					store.set('instantType', 'trigger-change');
				}, abortController.signal);

				return () => {
					abortController.abort();
				};
			}

			return undefined;
		},
		[domReference, runOnceAnimationsFinish, store],
		subSlot(slot, 'e:triggerChange'),
	);

	const state: MenuPositionerState = {
		open,
		side: positioner.side,
		align: positioner.align,
		anchorHidden: positioner.anchorHidden,
		nested: parent.type === 'menu',
		instant: instantType,
	};

	const menubarModal = parent.type === 'menubar' && parent.context.modal;
	const popupModal = modal && lastOpenChangeReason !== REASONS.triggerHover;

	useAnchoredPopupScrollLock(
		open && (menubarModal || popupModal),
		openMethod === 'touch',
		positionerElement,
		triggerElement,
	);

	const setPositionerElement = store.useStateSetter('positionerElement', subSlot(slot, 'setPosEl'));

	const element = usePositioner(
		componentProps,
		state,
		{
			styles: positioner.positionerStyles,
			transitionStatus,
			props: elementProps,
			refs: [forwardedRef, setPositionerElement],
			hidden: !mounted,
			inert: !open,
		},
		subSlot(slot, 'positioner'),
	);

	const shouldRenderBackdrop =
		mounted &&
		parent.type !== 'menu' &&
		((parent.type !== 'menubar' && modal && lastOpenChangeReason !== REASONS.triggerHover) ||
			(parent.type === 'menubar' && parent.context.modal));

	// Cuts a hole in the backdrop to allow pointer interaction with the menubar or dropdown menu
	// trigger element.
	let backdropCutout: HTMLElement | null = null;
	if (parent.type === 'menubar') {
		backdropCutout = parent.context.contentElement;
	} else if (parent.type === undefined) {
		backdropCutout = triggerElement as HTMLElement | null;
	}

	return createElement(MenuPositionerContext.Provider, {
		value: positioner as unknown as MenuPositionerContextValue,
		children: [
			shouldRenderBackdrop
				? createElement(InternalBackdrop, {
						key: 'backdrop',
						ref:
							parent.type === 'context-menu' || parent.type === 'nested-context-menu'
								? parent.context.internalBackdropRef
								: null,
						inert: inertValue(!open),
						cutout: backdropCutout,
					})
				: null,
			createElement(FloatingNode, {
				key: 'node',
				id: floatingNodeId,
				children: createElement(CompositeList, {
					elementsRef: store.context.itemDomElements,
					labelsRef: store.context.itemLabels,
					children: element,
				}),
			}),
		],
	});
}

export interface MenuPositionerState {
	/** Whether the menu is currently open. */
	open: boolean;
	/** The side of the anchor the component is placed on. */
	side: Side;
	/** The alignment of the component relative to the anchor. */
	align: Align;
	/** Whether the anchor element is hidden. */
	anchorHidden: boolean;
	/** Whether the component is nested. */
	nested: boolean;
	/** Whether CSS transitions should be disabled. */
	instant: string | undefined;
}

export interface MenuPositionerProps extends UseAnchorPositioningSharedParameters {
	[key: string]: any;
}

// --- Popup -------------------------------------------------------------------

const menuPopupStateAttributesMapping: StateAttributesMapping<any> = {
	...popupStateMapping,
	...transitionStatusMapping,
};

function MenuPopup(componentProps: any): any {
	const slot = S('MenuPopup');
	const {
		render,
		className,
		style,
		finalFocus,
		ref: forwardedRef,
		...elementProps
	} = componentProps;

	const { store } = useMenuRootContext() as MenuRootContextValue;
	const { side, align } = useMenuPositionerContext();
	// No Toolbar context in this phase; the composite key-stop is toolbar-only.
	const insideToolbar = false;

	const open = store.useState('open', subSlot(slot, 'open'));
	const transitionStatus = store.useState('transitionStatus', subSlot(slot, 'trans'));
	const popupProps = store.useState('popupProps', subSlot(slot, 'popupProps'));
	const mounted = store.useState('mounted', subSlot(slot, 'mounted'));
	const instantType = store.useState('instantType', subSlot(slot, 'instant'));
	const triggerElement = store.useState('activeTriggerElement', subSlot(slot, 'trigger'));
	const parent = store.useState('parent', subSlot(slot, 'parent'));
	const lastOpenChangeReason = store.useState('lastOpenChangeReason', subSlot(slot, 'locr'));
	const rootId = store.useState('rootId', subSlot(slot, 'rootId'));
	const floatingContext = store.useState('floatingRootContext', subSlot(slot, 'frc'));
	const floatingTreeRoot = store.useState('floatingTreeRoot', subSlot(slot, 'ftr'));
	const closeDelay = store.useState('closeDelay', subSlot(slot, 'closeDelay'));
	const hoverEnabled = store.useState('hoverEnabled', subSlot(slot, 'hover'));
	const disabled = store.useState('disabled', subSlot(slot, 'disabled'));
	const openMethod = store.useState('openMethod', subSlot(slot, 'method'));

	const isContextMenu = parent.type === 'context-menu';

	useOpenChangeComplete(
		{
			open,
			ref: store.context.popupRef,
			onComplete() {
				if (open) {
					store.context.onOpenChangeComplete?.(true);
				}
			},
		},
		subSlot(slot, 'occ'),
	);

	useEffect(
		() => {
			function handleClose(event: {
				domEvent: Event | undefined;
				reason: MenuRootChangeEventReason;
			}) {
				store.setOpen(false, createChangeEventDetails(event.reason, event.domEvent));
			}

			floatingTreeRoot.events.on('close', handleClose);

			return () => {
				floatingTreeRoot.events.off('close', handleClose);
			};
		},
		[floatingTreeRoot.events, store],
		subSlot(slot, 'e:close'),
	);

	useHoverFloatingInteraction(
		floatingContext,
		{
			enabled: hoverEnabled && !disabled && !isContextMenu && parent.type !== 'menubar',
			closeDelay,
		},
		subSlot(slot, 'hoverInteraction'),
	);

	const setPopupElement = store.useStateSetter('popupElement', subSlot(slot, 'setPopupEl'));

	const state: MenuPopupState = {
		transitionStatus,
		side,
		align,
		open,
		nested: parent.type === 'menu',
		instant: instantType,
	};

	const element = useRenderElement(
		'div',
		componentProps,
		{
			state,
			ref: [forwardedRef, store.context.popupRef, setPopupElement],
			stateAttributesMapping: menuPopupStateAttributesMapping,
			props: [
				popupProps,
				{
					onKeyDown(event: KeyboardEvent) {
						if (insideToolbar && COMPOSITE_KEYS.has(event.key)) {
							event.stopPropagation();
						}
					},
				},
				getDisabledMountTransitionStyles(transitionStatus),
				elementProps,
				{ 'data-rootownerid': rootId } as Record<string, string>,
			],
		},
		subSlot(slot, 're'),
	);

	let returnFocus = parent.type === undefined || isContextMenu;
	if (
		triggerElement ||
		(parent.type === 'menubar' && lastOpenChangeReason !== REASONS.outsidePress)
	) {
		returnFocus = true;
	}

	return createElement(FloatingFocusManager, {
		context: floatingContext,
		openInteractionType: openMethod,
		modal: isContextMenu,
		disabled: !mounted,
		returnFocus: finalFocus === undefined ? returnFocus : finalFocus,
		initialFocus: parent.type !== 'menu',
		restoreFocus: true,
		externalTree: parent.type !== 'menubar' ? floatingTreeRoot : undefined,
		previousFocusableElement: triggerElement as HTMLElement | null,
		nextFocusableElement:
			parent.type === undefined ? store.context.triggerFocusTargetRef : undefined,
		beforeContentFocusGuardRef:
			parent.type === undefined ? store.context.beforeContentFocusGuardRef : undefined,
		children: element,
	});
}

export interface MenuPopupState {
	/** The transition status of the component. */
	transitionStatus: TransitionStatus;
	/** The side of the anchor the component is placed on. */
	side: Side;
	/** The alignment of the component relative to the anchor. */
	align: Align;
	/** Whether the menu is currently open. */
	open: boolean;
	/** Whether the component is nested. */
	nested: boolean;
	/** Whether transitions should be skipped. */
	instant: 'dismiss' | 'click' | 'group' | 'trigger-change' | undefined;
}

// --- Item state attributes ----------------------------------------------------

/**
 * Ported from `.base-ui/packages/react/src/menu/utils/stateAttributesMapping.ts` (v1.6.0), with the
 * `MenuCheckboxItemDataAttributes` values it references inlined. Shared by `CheckboxItem`,
 * `RadioItem` and both indicators: a `checked` state maps to a PRESENT/ABSENT attribute pair rather
 * than `data-checked="false"`.
 */
export const itemMapping: StateAttributesMapping<{ checked: boolean }> = {
	checked(value: boolean): Record<string, string> {
		if (value) {
			return { 'data-checked': '' };
		}
		return { 'data-unchecked': '' };
	},
	...transitionStatusMapping,
};

// --- Item internals -----------------------------------------------------------

export const REGULAR_ITEM = {
	type: 'regular-item' as const,
};

export type UseMenuItemMetadata =
	| typeof REGULAR_ITEM
	| {
			type: 'submenu-trigger';
			setActive: () => void;
	  };

export interface UseMenuItemCommonPropsParameters {
	closeOnClick: boolean;
	highlighted: boolean;
	id: string | undefined;
	nodeId: string | undefined;
	store: MenuStore<any>;
	typingRef?: { current: boolean } | undefined;
	itemRef: { current: HTMLElement | null };
	itemMetadata?: UseMenuItemMetadata | undefined;
}

/**
 * The props every menu item type shares: id/role/tabIndex plus the keydown, mousemove, click and
 * mouseup handlers. Ported from `menu/item/useMenuItemCommonProps.ts`.
 */
export function useMenuItemCommonProps(
	params: UseMenuItemCommonPropsParameters,
	slot: symbol | undefined,
): HTMLProps {
	const { closeOnClick, highlighted, id, nodeId, store, typingRef, itemRef, itemMetadata } = params;

	const { events: menuEvents } = store.useState('floatingTreeRoot', subSlot(slot, 'ftr'));
	const open = store.useState('open', subSlot(slot, 'open'));
	const contextMenuContext = useContextMenuRootContext(true);
	const isContextMenu = contextMenuContext !== undefined;

	return useMemo(
		() => ({
			id,
			role: 'menuitem' as const,
			tabIndex: open && highlighted ? 0 : -1,
			onKeyDown(event: KeyboardEvent) {
				if (event.key === ' ' && typingRef?.current) {
					event.preventDefault();
				}
			},
			onMouseMove(event: MouseEvent) {
				if (!nodeId) {
					return;
				}

				// Inform the floating tree that a menu item within this menu was hovered/moved over
				// so unrelated descendant submenus can be closed.
				menuEvents.emit('itemhover', {
					nodeId,
					target: event.currentTarget,
				});
			},
			onClick(event: MouseEvent) {
				if (closeOnClick) {
					menuEvents.emit('close', { domEvent: event, reason: REASONS.itemPress });
				}
			},
			onMouseUp(event: MouseEvent) {
				if (contextMenuContext) {
					const initialCursorPoint = contextMenuContext.initialCursorPointRef.current;
					contextMenuContext.initialCursorPointRef.current = null;
					if (
						isContextMenu &&
						initialCursorPoint &&
						Math.abs(event.clientX - initialCursorPoint.x) <= 1 &&
						Math.abs(event.clientY - initialCursorPoint.y) <= 1
					) {
						return;
					}

					// On non-macOS platforms, this mouseup belongs to the right-click gesture that
					// opened the context menu, so it must not activate an item.
					if (isContextMenu && !platform.os.mac && event.button === 2) {
						return;
					}
				}

				if (
					itemRef.current &&
					store.context.allowMouseUpTriggerRef.current &&
					(!isContextMenu || event.button === 2)
				) {
					// Fires when the user presses the trigger, moves the cursor, and releases over
					// the item. Trigger the click and override `closeOnClick` to always close.
					if (!itemMetadata || itemMetadata.type === 'regular-item') {
						itemRef.current.click();
					}
				}
			},
		}),
		[
			closeOnClick,
			highlighted,
			id,
			menuEvents,
			nodeId,
			open,
			store,
			typingRef,
			itemRef,
			contextMenuContext,
			isContextMenu,
			itemMetadata,
		],
		subSlot(slot, 'm'),
	);
}

export interface UseMenuItemParameters {
	closeOnClick: boolean;
	disabled: boolean;
	highlighted: boolean;
	id: string | undefined;
	nativeButton: boolean;
	itemMetadata: UseMenuItemMetadata;
	nodeId: string | undefined;
	store: MenuStore<any>;
	typingRef?: { current: boolean } | undefined;
}

export interface UseMenuItemReturnValue {
	getItemProps: (externalProps?: HTMLProps) => HTMLProps;
	itemRef: (node: HTMLElement | null) => void;
}

/** Ported from `menu/item/useMenuItem.ts`. */
export function useMenuItem(
	params: UseMenuItemParameters,
	slot: symbol | undefined,
): UseMenuItemReturnValue {
	const {
		closeOnClick,
		disabled: disabledProp = false,
		highlighted,
		id,
		store,
		typingRef = store.context.typingRef,
		nativeButton,
		itemMetadata,
		nodeId,
	} = params;

	const rootDisabled = store.useState('disabled', subSlot(slot, 'rd'));
	const disabled = disabledProp || rootDisabled;

	const itemRef = useRef<HTMLElement | null>(null, subSlot(slot, 'ref'));

	const { getButtonProps, buttonRef } = useButton(
		{
			disabled,
			focusableWhenDisabled: true,
			native: nativeButton,
			composite: true,
		},
		subSlot(slot, 'btn'),
	);

	const commonProps = useMenuItemCommonProps(
		{
			closeOnClick,
			highlighted,
			id,
			nodeId,
			store,
			typingRef,
			itemRef,
			itemMetadata,
		},
		subSlot(slot, 'common'),
	);

	const getItemProps = useCallback(
		(externalProps?: HTMLProps): HTMLProps => {
			return mergeProps(
				commonProps,
				{
					onMouseEnter() {
						if (itemMetadata.type !== 'submenu-trigger') {
							return;
						}

						itemMetadata.setActive();
					},
				},
				externalProps,
				getButtonProps,
			);
		},
		[commonProps, getButtonProps, itemMetadata],
		subSlot(slot, 'gip'),
	);

	const mergedRef = useComposedRefs(itemRef, buttonRef, subSlot(slot, 'refs'));

	return useMemo(
		() => ({
			getItemProps,
			itemRef: mergedRef,
		}),
		[getItemProps, mergedRef],
		subSlot(slot, 'ret'),
	);
}

// --- Item ---------------------------------------------------------------------

function MenuItem(componentProps: any): any {
	const slot = S('MenuItem');
	const {
		render,
		className,
		id: idProp,
		label,
		nativeButton = false,
		disabled = false,
		closeOnClick = true,
		style,
		ref: forwardedRef,
		...elementProps
	} = componentProps;

	const listItem = useCompositeListItem({ label }, subSlot(slot, 'li'));
	const menuPositionerContext = useMenuPositionerContext(true);
	const id = useBaseUiId(idProp, subSlot(slot, 'id'));

	const { store } = useMenuRootContext() as MenuRootContextValue;
	const highlighted = store.useState('isActive', subSlot(slot, 'hl'), listItem.index);
	const itemProps = store.useState('itemProps', subSlot(slot, 'ip'));

	const { getItemProps, itemRef } = useMenuItem(
		{
			closeOnClick,
			disabled,
			highlighted,
			id,
			store,
			nativeButton,
			nodeId: menuPositionerContext?.context.nodeId,
			itemMetadata: REGULAR_ITEM,
		},
		subSlot(slot, 'item'),
	);

	const state: MenuItemState = {
		disabled,
		highlighted,
	};

	return useRenderElement(
		'div',
		componentProps,
		{
			state,
			props: [itemProps, elementProps, getItemProps],
			ref: [itemRef, forwardedRef, listItem.ref],
		},
		subSlot(slot, 're'),
	);
}

export interface MenuItemState {
	/** Whether the item should ignore user interaction. */
	disabled: boolean;
	/** Whether the item is highlighted. */
	highlighted: boolean;
}

// --- LinkItem -----------------------------------------------------------------

function MenuLinkItem(componentProps: any): any {
	const slot = S('MenuLinkItem');
	const {
		render,
		className,
		id: idProp,
		label,
		closeOnClick = false,
		style,
		ref: forwardedRef,
		...elementProps
	} = componentProps;

	const linkRef = useRef<HTMLAnchorElement | null>(null, subSlot(slot, 'link'));

	const listItem = useCompositeListItem({ label }, subSlot(slot, 'li'));
	const menuPositionerContext = useMenuPositionerContext(true);
	const nodeId = menuPositionerContext?.context.nodeId;

	const id = useBaseUiId(idProp, subSlot(slot, 'id'));

	const { store } = useMenuRootContext() as MenuRootContextValue;
	const highlighted = store.useState('isActive', subSlot(slot, 'hl'), listItem.index);
	const itemProps = store.useState('itemProps', subSlot(slot, 'ip'));
	const typingRef = store.context.typingRef;

	const { getButtonProps, buttonRef } = useButton(
		{ native: false, composite: true },
		subSlot(slot, 'btn'),
	);

	const commonProps = useMenuItemCommonProps(
		{
			closeOnClick,
			highlighted,
			id,
			nodeId,
			store,
			typingRef,
			itemRef: linkRef,
		},
		subSlot(slot, 'common'),
	);

	function getItemProps(externalProps?: HTMLProps): HTMLProps {
		return mergeProps(commonProps, externalProps, getButtonProps);
	}

	const state: MenuLinkItemState = { highlighted };

	return useRenderElement(
		'a',
		componentProps,
		{
			state,
			props: [itemProps, elementProps, getItemProps],
			ref: [linkRef, buttonRef, forwardedRef, listItem.ref],
		},
		subSlot(slot, 're'),
	);
}

export interface MenuLinkItemState {
	/** Whether the item is highlighted. */
	highlighted: boolean;
}

// --- CheckboxItem -------------------------------------------------------------

export interface MenuCheckboxItemContextValue {
	checked: boolean;
	highlighted: boolean;
	disabled: boolean;
}

const MenuCheckboxItemContext = createContext<MenuCheckboxItemContextValue | undefined>(undefined);

export function useMenuCheckboxItemContext(): MenuCheckboxItemContextValue {
	const context = useContext(MenuCheckboxItemContext);
	if (context === undefined) {
		throw new Error(
			'Base UI: MenuCheckboxItemContext is missing. MenuCheckboxItem parts must be placed within <Menu.CheckboxItem>.',
		);
	}
	return context;
}

function MenuCheckboxItem(componentProps: any): any {
	const slot = S('MenuCheckboxItem');
	const {
		render,
		className,
		id: idProp,
		label,
		nativeButton = false,
		disabled = false,
		closeOnClick = false,
		checked: checkedProp,
		defaultChecked,
		onCheckedChange,
		style,
		ref: forwardedRef,
		...elementProps
	} = componentProps;

	const listItem = useCompositeListItem({ label }, subSlot(slot, 'li'));
	const menuPositionerContext = useMenuPositionerContext(true);
	const id = useBaseUiId(idProp, subSlot(slot, 'id'));

	const { store } = useMenuRootContext() as MenuRootContextValue;
	const highlighted = store.useState('isActive', subSlot(slot, 'hl'), listItem.index);
	const itemProps = store.useState('itemProps', subSlot(slot, 'ip'));

	const [checked, setChecked] = useControlled<boolean>(
		{
			controlled: checkedProp,
			default: defaultChecked ?? false,
		},
		subSlot(slot, 'ctrl'),
	);

	const { getItemProps, itemRef } = useMenuItem(
		{
			closeOnClick,
			disabled,
			highlighted,
			id,
			store,
			nativeButton,
			nodeId: menuPositionerContext?.context.nodeId,
			itemMetadata: REGULAR_ITEM,
		},
		subSlot(slot, 'item'),
	);

	const state: MenuCheckboxItemState = useMemo(
		() => ({
			disabled,
			highlighted,
			checked,
		}),
		[disabled, highlighted, checked],
		subSlot(slot, 'state'),
	);

	function handleClick(event: MouseEvent) {
		// octane dispatches NATIVE events, so upstream's `event.nativeEvent` collapses to `event`.
		const details = createChangeEventDetails(REASONS.itemPress, event, undefined, {
			preventUnmountOnClose() {},
		});

		onCheckedChange?.(!checked, details);

		if (details.isCanceled) {
			return;
		}

		setChecked((currentlyChecked: boolean) => !currentlyChecked);
	}

	const element = useRenderElement(
		'div',
		componentProps,
		{
			state,
			stateAttributesMapping: itemMapping,
			props: [
				itemProps,
				{
					role: 'menuitemcheckbox',
					'aria-checked': checked,
					onClick: handleClick,
				},
				elementProps,
				getItemProps,
			],
			ref: [itemRef, forwardedRef, listItem.ref],
		},
		subSlot(slot, 're'),
	);

	return createElement(MenuCheckboxItemContext.Provider, { value: state, children: element });
}

export interface MenuCheckboxItemState {
	/** Whether the checkbox item should ignore user interaction. */
	disabled: boolean;
	/** Whether the checkbox item is currently highlighted. */
	highlighted: boolean;
	/** Whether the checkbox item is currently ticked. */
	checked: boolean;
}

function MenuCheckboxItemIndicator(componentProps: any): any {
	const slot = S('MenuCheckboxItemIndicator');
	const {
		render,
		className,
		style,
		keepMounted = false,
		ref: forwardedRef,
		...elementProps
	} = componentProps;

	const item = useMenuCheckboxItemContext();

	const indicatorRef = useRef<HTMLSpanElement | null>(null, subSlot(slot, 'ref'));

	const { transitionStatus, setMounted } = useTransitionStatus(
		item.checked,
		undefined,
		undefined,
		subSlot(slot, 'ts'),
	);

	useOpenChangeComplete(
		{
			open: item.checked,
			ref: indicatorRef,
			onComplete() {
				if (!item.checked) {
					setMounted(false);
				}
			},
		},
		subSlot(slot, 'occ'),
	);

	const state: MenuCheckboxItemIndicatorState = {
		checked: item.checked,
		disabled: item.disabled,
		highlighted: item.highlighted,
		transitionStatus,
	};

	// UPSTREAM QUIRK, transcribed deliberately: this gates on `item.checked`, NOT on the `mounted`
	// flag `useTransitionStatus` returns — which is what `Checkbox.Indicator` and `Radio.Indicator`
	// use. So unchecking drops the node on the same commit and the exit transition
	// (`data-ending-style`) never runs, making the `useOpenChangeComplete` → `setMounted(false)`
	// pair below effectively dead for the uncheck direction. Base UI 1.6.0's menu indicators do not
	// even destructure `mounted` (`MenuCheckboxItemIndicator.tsx` L26). Reported as a bug in review;
	// "fixing" it would diverge from the real `@base-ui/react`, so it stays, pinned by the toggle
	// steps in `tests/differential/parity.test.ts`.
	return useRenderElement(
		'span',
		componentProps,
		{
			state,
			ref: [forwardedRef, indicatorRef],
			stateAttributesMapping: itemMapping,
			props: {
				'aria-hidden': true,
				...elementProps,
			},
			enabled: keepMounted || item.checked,
		},
		subSlot(slot, 're'),
	);
}

export interface MenuCheckboxItemIndicatorState {
	/** Whether the checkbox item is currently ticked. */
	checked: boolean;
	/** Whether the component should ignore user interaction. */
	disabled: boolean;
	/** Whether the item is highlighted. */
	highlighted: boolean;
	/** The transition status of the component. */
	transitionStatus: TransitionStatus;
}

// --- Group / GroupLabel -------------------------------------------------------

export type MenuGroupContextValue = (id: string | undefined) => void;

const MenuGroupContext = createContext<MenuGroupContextValue | undefined>(undefined);

export function useMenuGroupRootContext(): MenuGroupContextValue {
	const context = useContext(MenuGroupContext);
	if (context === undefined) {
		throw new Error(
			'Base UI: MenuGroupContext is missing. Menu group parts must be used within <Menu.Group> or <Menu.RadioGroup>.',
		);
	}
	return context;
}

function MenuGroup(componentProps: any): any {
	const slot = S('MenuGroup');
	const { render, className, style, ref: forwardedRef, ...elementProps } = componentProps;

	const [labelId, setLabelId] = useState<string | undefined>(undefined, subSlot(slot, 'label'));

	const element = useRenderElement(
		'div',
		componentProps,
		{
			ref: forwardedRef,
			props: {
				role: 'group',
				'aria-labelledby': labelId,
				...elementProps,
			},
		},
		subSlot(slot, 're'),
	);

	return createElement(MenuGroupContext.Provider, { value: setLabelId, children: element });
}

function MenuGroupLabel(componentProps: any): any {
	const slot = S('MenuGroupLabel');
	const {
		render,
		className,
		style,
		id: idProp,
		ref: forwardedRef,
		...elementProps
	} = componentProps;

	const id = useBaseUiId(idProp, subSlot(slot, 'id'));

	const setLabelId = useMenuGroupRootContext();

	useLayoutEffect(
		() => {
			setLabelId(id);
			return () => {
				setLabelId(undefined);
			};
		},
		[setLabelId, id],
		subSlot(slot, 'e'),
	);

	return useRenderElement(
		'div',
		componentProps,
		{
			ref: forwardedRef,
			props: {
				id,
				role: 'presentation',
				...elementProps,
			},
		},
		subSlot(slot, 're'),
	);
}

// --- RadioGroup / RadioItem ---------------------------------------------------

export interface MenuRadioGroupContextValue {
	value: any;
	setValue: (newValue: any, eventDetails: any) => void;
	disabled: boolean;
}

const MenuRadioGroupContext = createContext<MenuRadioGroupContextValue | undefined>(undefined);

export function useMenuRadioGroupContext(): MenuRadioGroupContextValue {
	const context = useContext(MenuRadioGroupContext);
	if (context === undefined) {
		throw new Error(
			'Base UI: MenuRadioGroupContext is missing. MenuRadioGroup parts must be placed within <Menu.RadioGroup>.',
		);
	}
	return context;
}

// Upstream wraps this in `React.memo`; octane memoizes component renders itself (autoMemo), and the
// wrapper carries no behavioral contract, so it is dropped.
function MenuRadioGroup(componentProps: any): any {
	const slot = S('MenuRadioGroup');
	const {
		render,
		className,
		value: valueProp,
		defaultValue,
		onValueChange: onValueChangeProp,
		disabled = false,
		style,
		'aria-labelledby': ariaLabelledByProp,
		ref: forwardedRef,
		...elementProps
	} = componentProps;

	const [labelId, setLabelId] = useState<string | undefined>(undefined, subSlot(slot, 'label'));

	const [value, setValueUnwrapped] = useControlled<any>(
		{
			controlled: valueProp,
			default: defaultValue,
		},
		subSlot(slot, 'ctrl'),
	);

	const setValue = useStableCallback(
		(newValue: any, eventDetails: any) => {
			onValueChangeProp?.(newValue, eventDetails);

			if (eventDetails.isCanceled) {
				return;
			}

			setValueUnwrapped(newValue);
		},
		subSlot(slot, 'setValue'),
	);

	const state: MenuRadioGroupState = { disabled };

	const element = useRenderElement(
		'div',
		componentProps,
		{
			state,
			ref: forwardedRef,
			props: {
				role: 'group',
				'aria-labelledby': ariaLabelledByProp ?? labelId,
				'aria-disabled': disabled || undefined,
				...elementProps,
			},
		},
		subSlot(slot, 're'),
	);

	const context: MenuRadioGroupContextValue = useMemo(
		() => ({
			value,
			setValue,
			disabled,
		}),
		[value, setValue, disabled],
		subSlot(slot, 'ctx'),
	);

	return createElement(MenuGroupContext.Provider, {
		value: setLabelId,
		children: createElement(MenuRadioGroupContext.Provider, { value: context, children: element }),
	});
}

export interface MenuRadioGroupState {
	/** Whether the component is disabled. */
	disabled: boolean;
}

export interface MenuRadioItemContextValue {
	checked: boolean;
	highlighted: boolean;
	disabled: boolean;
}

const MenuRadioItemContext = createContext<MenuRadioItemContextValue | undefined>(undefined);

export function useMenuRadioItemContext(): MenuRadioItemContextValue {
	const context = useContext(MenuRadioItemContext);
	if (context === undefined) {
		throw new Error(
			'Base UI: MenuRadioItemContext is missing. MenuRadioItem parts must be placed within <Menu.RadioItem>.',
		);
	}
	return context;
}

function MenuRadioItem(componentProps: any): any {
	const slot = S('MenuRadioItem');
	const {
		render,
		className,
		id: idProp,
		label,
		nativeButton = false,
		disabled: disabledProp = false,
		closeOnClick = false,
		value,
		style,
		ref: forwardedRef,
		...elementProps
	} = componentProps;

	const listItem = useCompositeListItem({ label }, subSlot(slot, 'li'));
	const menuPositionerContext = useMenuPositionerContext(true);
	const id = useBaseUiId(idProp, subSlot(slot, 'id'));

	const { store } = useMenuRootContext() as MenuRootContextValue;
	const highlighted = store.useState('isActive', subSlot(slot, 'hl'), listItem.index);
	const itemProps = store.useState('itemProps', subSlot(slot, 'ip'));

	const {
		value: selectedValue,
		setValue: setSelectedValue,
		disabled: groupDisabled,
	} = useMenuRadioGroupContext();

	const disabled = groupDisabled || disabledProp;
	const checked = selectedValue === value;

	const { getItemProps, itemRef } = useMenuItem(
		{
			closeOnClick,
			disabled,
			highlighted,
			id,
			store,
			nativeButton,
			nodeId: menuPositionerContext?.context.nodeId,
			itemMetadata: REGULAR_ITEM,
		},
		subSlot(slot, 'item'),
	);

	const state: MenuRadioItemState = useMemo(
		() => ({
			disabled,
			highlighted,
			checked,
		}),
		[disabled, highlighted, checked],
		subSlot(slot, 'state'),
	);

	function handleClick(event: MouseEvent) {
		// octane dispatches NATIVE events, so upstream's `event.nativeEvent` collapses to `event`.
		const details = createChangeEventDetails(REASONS.itemPress, event, undefined, {
			preventUnmountOnClose() {},
		});

		setSelectedValue(value, details);
	}

	const element = useRenderElement(
		'div',
		componentProps,
		{
			state,
			stateAttributesMapping: itemMapping,
			props: [
				itemProps,
				{
					role: 'menuitemradio',
					'aria-checked': checked,
					onClick: handleClick,
				},
				elementProps,
				getItemProps,
			],
			ref: [itemRef, forwardedRef, listItem.ref],
		},
		subSlot(slot, 're'),
	);

	return createElement(MenuRadioItemContext.Provider, { value: state, children: element });
}

export interface MenuRadioItemState {
	/** Whether the radio item should ignore user interaction. */
	disabled: boolean;
	/** Whether the radio item is currently highlighted. */
	highlighted: boolean;
	/** Whether the radio item is currently selected. */
	checked: boolean;
}

function MenuRadioItemIndicator(componentProps: any): any {
	const slot = S('MenuRadioItemIndicator');
	const {
		render,
		className,
		style,
		keepMounted = false,
		ref: forwardedRef,
		...elementProps
	} = componentProps;

	const item = useMenuRadioItemContext();

	const indicatorRef = useRef<HTMLSpanElement | null>(null, subSlot(slot, 'ref'));

	const { transitionStatus, setMounted } = useTransitionStatus(
		item.checked,
		undefined,
		undefined,
		subSlot(slot, 'ts'),
	);

	useOpenChangeComplete(
		{
			open: item.checked,
			ref: indicatorRef,
			onComplete() {
				if (!item.checked) {
					setMounted(false);
				}
			},
		},
		subSlot(slot, 'occ'),
	);

	const state: MenuRadioItemIndicatorState = {
		checked: item.checked,
		disabled: item.disabled,
		highlighted: item.highlighted,
		transitionStatus,
	};

	// UPSTREAM QUIRK, transcribed deliberately: this gates on `item.checked`, NOT on the `mounted`
	// flag `useTransitionStatus` returns — which is what `Checkbox.Indicator` and `Radio.Indicator`
	// use. So unchecking drops the node on the same commit and the exit transition
	// (`data-ending-style`) never runs, making the `useOpenChangeComplete` → `setMounted(false)`
	// pair below effectively dead for the uncheck direction. Base UI 1.6.0's menu indicators do not
	// even destructure `mounted` (`MenuCheckboxItemIndicator.tsx` L26). Reported as a bug in review;
	// "fixing" it would diverge from the real `@base-ui/react`, so it stays, pinned by the toggle
	// steps in `tests/differential/parity.test.ts`.
	return useRenderElement(
		'span',
		componentProps,
		{
			state,
			stateAttributesMapping: itemMapping,
			ref: [forwardedRef, indicatorRef],
			props: {
				'aria-hidden': true,
				...elementProps,
			},
			enabled: keepMounted || item.checked,
		},
		subSlot(slot, 're'),
	);
}

export interface MenuRadioItemIndicatorState {
	/** Whether the radio item is currently selected. */
	checked: boolean;
	/** Whether the component should ignore user interaction. */
	disabled: boolean;
	/** Whether the item is highlighted. */
	highlighted: boolean;
	/** The transition status of the component. */
	transitionStatus: TransitionStatus;
}

// --- Arrow --------------------------------------------------------------------

function MenuArrow(componentProps: any): any {
	const slot = S('MenuArrow');
	const { render, className, style, ref: forwardedRef, ...elementProps } = componentProps;

	const { store } = useMenuRootContext() as MenuRootContextValue;
	const { arrowRef, side, align, arrowUncentered, arrowStyles } = useMenuPositionerContext();
	const open = store.useState('open', subSlot(slot, 'open'));

	const state: MenuArrowState = {
		open,
		side,
		align,
		uncentered: arrowUncentered,
	};

	return useRenderElement(
		'div',
		componentProps,
		{
			ref: [arrowRef, forwardedRef],
			stateAttributesMapping: popupStateMapping,
			state,
			props: {
				style: arrowStyles,
				'aria-hidden': true,
				...elementProps,
			},
		},
		subSlot(slot, 're'),
	);
}

export interface MenuArrowState {
	/** Whether the menu is currently open. */
	open: boolean;
	/** The side of the anchor the component is placed on. */
	side: Side;
	/** The alignment of the component relative to the anchor. */
	align: Align;
	/** Whether the arrow cannot be centered on the anchor. */
	uncentered: boolean;
}

// --- Backdrop -----------------------------------------------------------------

const menuBackdropStateAttributesMapping: StateAttributesMapping<any> = {
	...popupStateMapping,
	...transitionStatusMapping,
};

function MenuBackdrop(componentProps: any): any {
	const slot = S('MenuBackdrop');
	const { render, className, style, ref: forwardedRef, ...elementProps } = componentProps;

	const { store } = useMenuRootContext() as MenuRootContextValue;
	const open = store.useState('open', subSlot(slot, 'open'));
	const mounted = store.useState('mounted', subSlot(slot, 'mounted'));
	const transitionStatus = store.useState('transitionStatus', subSlot(slot, 'trans'));
	const lastOpenChangeReason = store.useState('lastOpenChangeReason', subSlot(slot, 'locr'));

	const contextMenuContext = useContextMenuRootContext();

	const state: MenuBackdropState = {
		open,
		transitionStatus,
	};

	return useRenderElement(
		'div',
		componentProps,
		{
			ref: contextMenuContext?.backdropRef
				? [forwardedRef, contextMenuContext.backdropRef]
				: forwardedRef,
			state,
			stateAttributesMapping: menuBackdropStateAttributesMapping,
			props: [
				{
					role: 'presentation',
					hidden: !mounted,
					style: {
						pointerEvents: lastOpenChangeReason === REASONS.triggerHover ? 'none' : undefined,
						userSelect: 'none',
						WebkitUserSelect: 'none',
					},
				},
				elementProps,
			],
		},
		subSlot(slot, 're'),
	);
}

export interface MenuBackdropState {
	/** Whether the menu is currently open. */
	open: boolean;
	/** The transition status of the component. */
	transitionStatus: TransitionStatus;
}

// --- Viewport -----------------------------------------------------------------

export const MenuViewportCssVars = {
	/**
	 * The width of the parent popup when the previous content was rendered. Placed on the
	 * 'previous' container so the popup's dimensions can be frozen while content animates.
	 */
	popupWidth: '--popup-width',
	/** The height of the parent popup when the previous content was rendered. */
	popupHeight: '--popup-height',
} as const;

const menuViewportStateAttributesMapping: StateAttributesMapping<any> = {
	activationDirection: (value: string | undefined) =>
		value ? { 'data-activation-direction': value } : null,
};

// A viewport for displaying content transitions. Only needed when one popup can be opened by
// multiple triggers, its content changes per trigger, and switching between them is animated.
function MenuViewport(componentProps: any): any {
	const slot = S('MenuViewport');
	const { render, className, style, children, ref: forwardedRef, ...elementProps } = componentProps;

	const { store } = useMenuRootContext() as MenuRootContextValue;
	const { side } = useMenuPositionerContext();

	const instantType = store.useState('instantType', subSlot(slot, 'instant'));

	const { children: childrenToRender, state: viewportState } = usePopupViewport(
		{ store, side, cssVars: MenuViewportCssVars, children },
		subSlot(slot, 'vp'),
	);

	const state: MenuViewportState = {
		activationDirection: viewportState.activationDirection,
		transitioning: viewportState.transitioning,
		instant: instantType,
	};

	return useRenderElement(
		'div',
		componentProps,
		{
			state,
			ref: forwardedRef,
			props: [elementProps, { children: childrenToRender }],
			stateAttributesMapping: menuViewportStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);
}

export interface MenuViewportState {
	/** The activation direction of the transitioned content. */
	activationDirection: string | undefined;
	/** Whether the viewport is currently transitioning between contents. */
	transitioning: boolean;
	/** Present if animations should be instant. */
	instant: 'dismiss' | 'click' | 'group' | 'trigger-change' | undefined;
}

// --- SubmenuRoot --------------------------------------------------------------

/**
 * Groups all parts of a submenu. Renders no HTML element of its own — it provides
 * `MenuSubmenuRootContext` (which is what makes the nested `MenuRoot` resolve its `parent` to
 * `{ type: 'menu' }`) and then renders a plain `MenuRoot`.
 */
function MenuSubmenuRoot(props: any): any {
	const slot = S('MenuSubmenuRoot');
	const parentMenu = (useMenuRootContext() as MenuRootContextValue).store;

	const contextValue = useMemo(() => ({ parentMenu }), [parentMenu], subSlot(slot, 'ctx'));

	return createElement(MenuSubmenuRootContext.Provider, {
		value: contextValue,
		children: createElement(MenuRoot, props),
	});
}

// --- SubmenuTrigger -----------------------------------------------------------

/**
 * A menu item that opens a submenu. It is BOTH an item of the parent menu (it registers with the
 * parent's `CompositeList` and reads the parent's `itemProps`/`isActive`) and the trigger of its own
 * menu (it registers with this menu's store and drives its open state), which is why it reaches for
 * two stores at once.
 */
function MenuSubmenuTrigger(componentProps: any): any {
	const slot = S('MenuSubmenuTrigger');
	const {
		render,
		className,
		style,
		label,
		id: idProp,
		nativeButton = false,
		openOnHover = true,
		delay = 100,
		closeDelay = 0,
		disabled: disabledProp = false,
		ref: forwardedRef,
		...elementProps
	} = componentProps;

	const listItem = useCompositeListItem({ label }, subSlot(slot, 'li'));
	const menuPositionerContext = useMenuPositionerContext();

	const { store } = useMenuRootContext() as MenuRootContextValue;

	const thisTriggerId = useBaseUiId(idProp, subSlot(slot, 'id'));
	const open = store.useState('open', subSlot(slot, 'open'));
	const floatingRootContext = store.useState('floatingRootContext', subSlot(slot, 'frc'));
	const floatingTreeRoot = store.useState('floatingTreeRoot', subSlot(slot, 'ftr'));
	const popupId = store.useState('triggerPopupId', subSlot(slot, 'tpid'), thisTriggerId);

	const baseRegisterTrigger = useTriggerRegistration(
		thisTriggerId,
		store as any,
		subSlot(slot, 'reg'),
	);
	const registerTrigger = useCallback(
		(element: Element | null) => {
			const cleanup = baseRegisterTrigger(element);

			if (element !== null && store.select('open') && store.select('activeTriggerId') == null) {
				store.update({
					activeTriggerId: thisTriggerId,
					activeTriggerElement: element,
					closeDelay,
				});
			}

			return cleanup;
		},
		[baseRegisterTrigger, closeDelay, store, thisTriggerId],
		subSlot(slot, 'regcb'),
	);

	const triggerElementRef = useRef<HTMLElement | null>(null, subSlot(slot, 'ter'));
	const handleTriggerElementRef = useCallback(
		(el: HTMLElement | null) => {
			triggerElementRef.current = el;
			store.set('activeTriggerElement', el);
		},
		[store],
		subSlot(slot, 'tercb'),
	);

	const submenuRootContext = useMenuSubmenuRootContext();
	if (!submenuRootContext?.parentMenu) {
		throw new Error('Base UI: <Menu.SubmenuTrigger> must be placed in <Menu.SubmenuRoot>.');
	}

	store.useSyncedValue('closeDelay', closeDelay, subSlot(slot, 'cd'));

	const parentMenuStore = submenuRootContext.parentMenu;
	const rootDisabled = store.useState('disabled', subSlot(slot, 'rd'));
	const parentDisabled = parentMenuStore.useState('disabled', subSlot(slot, 'pd'));
	const disabled = disabledProp || rootDisabled || parentDisabled;

	// Upstream's dev-only `isElementDisabled` warning is dropped — this package carries no
	// `process.env.NODE_ENV` branches.

	const itemProps = parentMenuStore.useState('itemProps', subSlot(slot, 'ip'));
	const highlighted = parentMenuStore.useState('isActive', subSlot(slot, 'hl'), listItem.index);

	const itemMetadata = useMemo(
		() => ({
			type: 'submenu-trigger' as const,
			setActive() {
				if (parentMenuStore.select('highlightItemOnHover')) {
					parentMenuStore.set('activeIndex', listItem.index);
				}
			},
		}),
		[parentMenuStore, listItem.index],
		subSlot(slot, 'meta'),
	);

	const { getItemProps, itemRef } = useMenuItem(
		{
			closeOnClick: false,
			disabled,
			highlighted,
			id: thisTriggerId,
			store,
			typingRef: parentMenuStore.context.typingRef,
			nativeButton,
			itemMetadata,
			nodeId: menuPositionerContext?.context.nodeId,
		},
		subSlot(slot, 'item'),
	);

	const hoverEnabled = store.useState('hoverEnabled', subSlot(slot, 'he'));

	const hoverProps = useHoverReferenceInteraction(
		floatingRootContext,
		{
			enabled: hoverEnabled && openOnHover && !disabled,
			handleClose: safePolygon({ blockPointerEvents: true }),
			mouseOnly: true,
			move: true,
			restMs: delay,
			delay: { open: delay, close: closeDelay },
			shouldOpen: delay > 0 ? () => parentMenuStore.select('allowMouseEnter') : undefined,
			triggerElementRef,
			externalTree: floatingTreeRoot,
			isClosing: () => store.select('transitionStatus') === 'ending',
		},
		subSlot(slot, 'hover'),
	);

	const click = useClick(
		floatingRootContext,
		{
			enabled: !disabled,
			event: 'mousedown',
			toggle: !openOnHover,
			ignoreMouse: openOnHover,
			stickIfOpen: false,
		},
		subSlot(slot, 'click'),
	);

	const localInteractionProps = click.reference ?? EMPTY_OBJECT;

	// Transcribed verbatim, mutation included: the submenu trigger owns its OWN `id` (it is also a
	// parent-menu item), so the root's trigger props must not stamp one over it.
	const rootTriggerProps = store.useState('triggerProps', subSlot(slot, 'tp'), true);
	delete rootTriggerProps.id;

	const state: MenuSubmenuTriggerState = { disabled, highlighted, open };

	return useRenderElement(
		'div',
		componentProps,
		{
			state,
			stateAttributesMapping: triggerOpenStateMapping,
			props: [
				localInteractionProps,
				hoverProps,
				rootTriggerProps,
				itemProps,
				{
					'aria-controls': popupId,
					tabIndex: open || highlighted ? 0 : -1,
					onBlur() {
						if (highlighted) {
							parentMenuStore.set('activeIndex', null);
						}
					},
				},
				elementProps,
				getItemProps,
			],
			ref: [forwardedRef, listItem.ref, itemRef, registerTrigger, handleTriggerElementRef],
		},
		subSlot(slot, 're'),
	);
}

export interface MenuSubmenuTriggerState {
	/** Whether the component should ignore user interaction. */
	disabled: boolean;
	/** Whether the item is highlighted. */
	highlighted: boolean;
	/** Whether the menu is currently open. */
	open: boolean;
}

// --- Namespace ---------------------------------------------------------------

/**
 * The full upstream `menu/index.parts.ts` surface (Phase 3f stages 1–3).
 *
 * `Separator` is upstream's shared `Separator`, re-exported through the Menu namespace exactly as
 * `menu/index.parts.ts` does — not a Menu-specific part.
 */
export const Menu = {
	Root: MenuRoot,
	Trigger: MenuTrigger,
	Portal: MenuPortal,
	Positioner: MenuPositioner,
	Popup: MenuPopup,
	Arrow: MenuArrow,
	Backdrop: MenuBackdrop,
	Viewport: MenuViewport,
	Item: MenuItem,
	LinkItem: MenuLinkItem,
	CheckboxItem: MenuCheckboxItem,
	CheckboxItemIndicator: MenuCheckboxItemIndicator,
	RadioGroup: MenuRadioGroup,
	RadioItem: MenuRadioItem,
	RadioItemIndicator: MenuRadioItemIndicator,
	Group: MenuGroup,
	GroupLabel: MenuGroupLabel,
	Separator,
	SubmenuRoot: MenuSubmenuRoot,
	SubmenuTrigger: MenuSubmenuTrigger,
	createHandle: createMenuHandle,
	Handle: MenuHandle,
};
