// Ported from .base-ui/packages/react/src/tabs/ (v1.6.0): root/TabsRootContext,
// root/stateAttributesMapping, root/TabsRoot, list/TabsListContext, list/TabsList, tab/TabsTab,
// panel/TabsPanel — plus its `index.parts` (the `Tabs` namespace).
//
// Tabs is a thin family over the composite infrastructure this package already carries: `List` IS a
// `CompositeRoot` (roving focus, Home/End, loop), each `Tab` is a `useCompositeItem`, and `Root`
// wraps the whole thing in a `CompositeList` so panels can register their own indices. Reading this
// alongside `utils/composite/` is the intended way to follow it.
//
// WHAT ROOT ACTUALLY OWNS, since the file reads as a lot of bookkeeping:
//   1. The controlled/uncontrolled value, via `useControlled`.
//   2. The ACTIVATION DIRECTION — which way the selection moved — computed DURING RENDER when the
//      value changes, so children see the correct direction on their first render after a change
//      rather than one commit late (upstream's mui/base-ui#3873). The previous-value snapshot then
//      syncs in a layout effect.
//   3. An automatic fallback policy for UNCONTROLLED roots only: when the selected tab is disabled
//      or removed, selection falls back to the first enabled tab and reports a reason
//      ('initial' | 'disabled' | 'missing'). Controlled roots keep exactly what the parent gave
//      them. An explicit `defaultValue` may deliberately point at a disabled tab on mount, and that
//      is honored once — after the selection first becomes valid, later disabled states fall back.
//      Automatic changes are not cancelable.
//   4. Two id registries wiring `aria-controls` on a Tab to its Panel, and `aria-labelledby` back.
//
// NOT PORTED YET: `Tabs.Indicator`. It positions itself from measured tab geometry and ships a
// pre-hydration `<script>` to avoid a first-paint jump, which is a separate piece of work with its
// own SSR contract. Every other part is here, and the shadcn `tabs` family this unblocks does not
// use it. Adding it later is additive.
//
// ORIENTATION ATTRIBUTE — worth stating because a consumer will hit it: at this pin the state-to-
// attribute conversion emits `data-orientation="horizontal" | "vertical"`, NOT the bare
// `data-horizontal` / `data-vertical` that newer Base UI releases (and the current shadcn sources
// written against them) use. That is faithful to v1.6.0; the mismatch is a version skew, and it is
// the consuming layer's job to target what this pin emits.
//
// octane adaptations:
//   1. `forwardRef` → ref-as-prop; merged refs become an array ref, which octane accepts.
//   2. `useIsoLayoutEffect` → `useLayoutEffect`, per the other ports in this package.
//   3. Events are native, so handlers receive the native event directly.
//   4. Every hook threads an explicit compiler slot (`S(...)` / `subSlot(...)`), because these are
//      plain `.ts` hooks rather than compiled `.tsrx` call sites.
import {
	createContext,
	createElement,
	useContext,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'octane';

import { S, subSlot } from './internal';
import { useRenderElement } from './utils/useRenderElement';
import type { StateAttributesMapping } from './utils/getStateAttributesProps';
import { useBaseUiId } from './utils/useBaseUiId';
import { useButton } from './utils/useButton';
import { useControlled } from './utils/useControlled';
import { useStableCallback } from './utils/useStableCallback';
import { inertValue } from './utils/inertValue';
import { ownerDocument } from './utils/owner';
import { activeElement, contains } from './utils/floating/element';
import { transitionStatusMapping, useTransitionStatus } from './utils/useTransitionStatus';
import type { TransitionStatus } from './utils/useTransitionStatus';
import { useOpenChangeComplete } from './utils/useOpenChangeComplete';
import { CompositeList } from './utils/composite/CompositeList';
import { CompositeRoot } from './utils/composite/CompositeRoot';
import { useCompositeItem } from './utils/composite/useCompositeItem';
import { useCompositeListItem } from './utils/composite/useCompositeListItem';
import { ACTIVE_COMPOSITE_ITEM } from './utils/composite/keys';
import { createChangeEventDetails, REASONS } from './utils/createChangeEventDetails';

const EMPTY_DISABLED_INDICES: number[] = [];

export type TabsValue = any;
export type TabsActivationDirection = 'left' | 'right' | 'up' | 'down' | 'none';
export type TabsOrientation = 'horizontal' | 'vertical';

export interface TabsRootState {
	orientation: TabsOrientation;
	tabActivationDirection: TabsActivationDirection;
}

const tabsStateAttributesMapping: StateAttributesMapping<any> = {
	tabActivationDirection: (dir: TabsActivationDirection) => ({
		'data-activation-direction': dir,
	}),
};

// --- Root context -------------------------------------------------------------

export interface TabsRootContextValue {
	value: TabsValue;
	onValueChange: (value: TabsValue, eventDetails: any) => void;
	orientation: TabsOrientation;
	getTabElementBySelectedValue: (selectedValue: TabsValue | undefined) => HTMLElement | null;
	getTabIdByPanelValue: (panelValue: TabsValue) => string | undefined;
	getTabPanelIdByValue: (tabValue: TabsValue) => string | undefined;
	registerMountedTabPanel: (panelValue: TabsValue, panelId: string) => void;
	unregisterMountedTabPanel: (panelValue: TabsValue, panelId: string) => void;
	setTabMap: (map: Map<Node, any>) => void;
	tabActivationDirection: TabsActivationDirection;
}

const TabsRootContext = createContext<TabsRootContextValue | undefined>(undefined);

export function useTabsRootContext(): TabsRootContextValue {
	const context = useContext(TabsRootContext);
	if (context === undefined) {
		throw new Error(
			'Base UI: TabsRootContext is missing. Tabs parts must be placed within <Tabs.Root>.',
		);
	}
	return context;
}

// --- List context -------------------------------------------------------------

export interface TabsListContextValue {
	activateOnFocus: boolean;
	highlightedTabIndex: number;
	onTabActivation: (newValue: TabsValue, eventDetails: any) => void;
	registerTabResizeObserverElement: (element: HTMLElement) => () => void;
	setHighlightedTabIndex: (index: number) => void;
	tabsListElement: HTMLElement | null;
}

const TabsListContext = createContext<TabsListContextValue | undefined>(undefined);

export function useTabsListContext(): TabsListContextValue {
	const context = useContext(TabsListContext);
	if (context === undefined) {
		throw new Error(
			'Base UI: TabsListContext is missing. TabsList parts must be placed within <Tabs.List>.',
		);
	}
	return context;
}

// --- Activation direction -----------------------------------------------------

function computeActivationDirection(
	oldValue: TabsValue,
	newValue: TabsValue,
	orientation: TabsOrientation,
	tabMap: Map<Node, any>,
): TabsActivationDirection {
	if (oldValue == null || newValue == null) {
		return 'none';
	}

	let oldTab: HTMLElement | null = null;
	let newTab: HTMLElement | null = null;

	for (const [tabElement, tabMetadata] of tabMap.entries()) {
		if (tabMetadata == null) {
			continue;
		}
		const tabValue = tabMetadata.value ?? tabMetadata.index;
		if (oldValue === tabValue) {
			oldTab = tabElement as HTMLElement;
		}
		if (newValue === tabValue) {
			newTab = tabElement as HTMLElement;
		}
		if (oldTab != null && newTab != null) {
			break;
		}
	}

	if (oldTab == null || newTab == null) {
		// Dynamic tabs: an element may not be registered yet (added and selected in the same
		// update), so infer from the values themselves when they are comparable.
		if (
			oldTab !== newTab &&
			(typeof oldValue === 'number' || typeof oldValue === 'string') &&
			typeof oldValue === typeof newValue
		) {
			if (orientation === 'horizontal') {
				return newValue > oldValue ? 'right' : 'left';
			}
			return newValue > oldValue ? 'down' : 'up';
		}
		return 'none';
	}

	const oldRect = oldTab.getBoundingClientRect();
	const newRect = newTab.getBoundingClientRect();

	if (orientation === 'horizontal') {
		if (newRect.left < oldRect.left) {
			return 'left';
		}
		if (newRect.left > oldRect.left) {
			return 'right';
		}
	} else {
		if (newRect.top < oldRect.top) {
			return 'up';
		}
		if (newRect.top > oldRect.top) {
			return 'down';
		}
	}

	return 'none';
}

// --- Root ---------------------------------------------------------------------

function TabsRoot(props: any): any {
	const slot = S('TabsRoot');
	const {
		className,
		defaultValue: defaultValueProp = 0,
		onValueChange: onValueChangeProp,
		orientation = 'horizontal',
		render,
		value: valueProp,
		style,
		ref,
		...elementProps
	} = props;

	// Whether the consumer explicitly passed a defined `defaultValue`, which decides the
	// disabled-default honor policy below.
	const hasExplicitDefaultValueProp = props.defaultValue !== undefined;

	const tabPanelRefs = useRef<(HTMLElement | null)[]>([], subSlot(slot, 'panelRefs'));
	const [mountedTabPanels, setMountedTabPanels] = useState(
		() => new Map<TabsValue, string>(),
		subSlot(slot, 'mountedPanels'),
	);

	const [value, setValue] = useControlled(
		{ controlled: valueProp, default: defaultValueProp, name: 'Tabs', state: 'value' },
		subSlot(slot, 'value'),
	);

	const isControlled = valueProp !== undefined;

	const [tabMap, setTabMap] = useState(() => new Map<Node, any>(), subSlot(slot, 'tabMap'));
	const lastKnownTabElementRef = useRef<Node | undefined>(undefined, subSlot(slot, 'lastTabEl'));

	const getTabElementBySelectedValue = useStableCallback(
		(selectedValue: TabsValue | undefined): HTMLElement | null => {
			if (selectedValue === undefined) {
				return null;
			}
			for (const [tabElement, tabMetadata] of tabMap.entries()) {
				if (tabMetadata != null && selectedValue === (tabMetadata.value ?? tabMetadata.index)) {
					return tabElement as HTMLElement;
				}
			}
			return null;
		},
		subSlot(slot, 'getTabEl'),
	);

	const [activationDirectionState, setActivationDirectionState] = useState(
		() => ({ previousValue: value, tabActivationDirection: 'none' as TabsActivationDirection }),
		subSlot(slot, 'activationDir'),
	);
	const { previousValue, tabActivationDirection: committedTabActivationDirection } =
		activationDirectionState;

	let tabActivationDirection = committedTabActivationDirection;
	let directionComputationIncomplete = false;

	// Computed DURING RENDER so children see the right direction on their first render after the
	// selection changes, rather than one commit later.
	if (previousValue !== value) {
		tabActivationDirection = computeActivationDirection(previousValue, value, orientation, tabMap);
		// A tab added and selected in the same update is not in tabMap yet, so the direction above
		// came from the value fallback. Keep the snapshot stale to recompute from DOM positions.
		directionComputationIncomplete =
			previousValue != null && value != null && getTabElementBySelectedValue(value) == null;
	}

	const nextPreviousValue = directionComputationIncomplete ? previousValue : value;
	const shouldSyncActivationDirectionState =
		previousValue !== nextPreviousValue ||
		committedTabActivationDirection !== tabActivationDirection;

	useLayoutEffect(
		() => {
			if (!shouldSyncActivationDirectionState) {
				return;
			}
			setActivationDirectionState({
				previousValue: nextPreviousValue,
				tabActivationDirection,
			});
		},
		[nextPreviousValue, shouldSyncActivationDirectionState, tabActivationDirection],
		subSlot(slot, 'e:syncDir'),
	);

	const onValueChange = useStableCallback(
		(newValue: TabsValue, eventDetails: any) => {
			const activationDirection = computeActivationDirection(value, newValue, orientation, tabMap);
			eventDetails.activationDirection = activationDirection;
			onValueChangeProp?.(newValue, eventDetails);
			if (eventDetails.isCanceled) {
				return;
			}
			setValue(newValue);
		},
		subSlot(slot, 'onValueChange'),
	);

	const notifyAutomaticValueChange = useStableCallback(
		(nextValue: TabsValue, reason: string) => {
			onValueChangeProp?.(
				nextValue,
				createChangeEventDetails(reason, undefined, undefined, {
					activationDirection: 'none',
				}),
			);
		},
		subSlot(slot, 'notifyAuto'),
	);

	const registerMountedTabPanel = useStableCallback(
		(panelValue: TabsValue, panelId: string) => {
			setMountedTabPanels((prev: Map<TabsValue, string>) => {
				if (prev.get(panelValue) === panelId) {
					return prev;
				}
				const next = new Map(prev);
				next.set(panelValue, panelId);
				return next;
			});
		},
		subSlot(slot, 'registerPanel'),
	);

	const unregisterMountedTabPanel = useStableCallback(
		(panelValue: TabsValue, panelId: string) => {
			setMountedTabPanels((prev: Map<TabsValue, string>) => {
				if (!prev.has(panelValue) || prev.get(panelValue) !== panelId) {
					return prev;
				}
				const next = new Map(prev);
				next.delete(panelValue);
				return next;
			});
		},
		subSlot(slot, 'unregisterPanel'),
	);

	// `aria-controls` on a Tab points at its Panel's id.
	const getTabPanelIdByValue = useStableCallback(
		(tabValue: TabsValue) => mountedTabPanels.get(tabValue),
		subSlot(slot, 'getPanelId'),
	);

	// `aria-labelledby` on a Panel points back at its Tab's id.
	const getTabIdByPanelValue = useStableCallback(
		(tabPanelValue: TabsValue) => {
			for (const tabMetadata of tabMap.values()) {
				if (tabPanelValue === tabMetadata?.value) {
					return tabMetadata?.id;
				}
			}
			return undefined;
		},
		subSlot(slot, 'getTabId'),
	);

	const tabsContextValue: TabsRootContextValue = useMemo(
		() => ({
			getTabElementBySelectedValue,
			getTabIdByPanelValue,
			getTabPanelIdByValue,
			onValueChange,
			orientation,
			registerMountedTabPanel,
			setTabMap,
			unregisterMountedTabPanel,
			tabActivationDirection,
			value,
		}),
		[
			getTabElementBySelectedValue,
			getTabIdByPanelValue,
			getTabPanelIdByValue,
			onValueChange,
			orientation,
			registerMountedTabPanel,
			setTabMap,
			unregisterMountedTabPanel,
			tabActivationDirection,
			value,
		],
		subSlot(slot, 'ctx'),
	);

	const selectedTabMetadata = useMemo(
		() => {
			for (const tabMetadata of tabMap.values()) {
				if (tabMetadata != null && tabMetadata.value === value) {
					return tabMetadata;
				}
			}
			return undefined;
		},
		[tabMap, value],
		subSlot(slot, 'selectedMeta'),
	);

	const firstEnabledTabValue = useMemo(
		() => {
			for (const tabMetadata of tabMap.values()) {
				if (tabMetadata != null && !tabMetadata.disabled) {
					return tabMetadata.value;
				}
			}
			return undefined;
		},
		[tabMap],
		subSlot(slot, 'firstEnabled'),
	);

	// An implicit uncontrolled selection is still an automatic change, so it is notified once when
	// the tabs first register. An explicit default is treated as user-owned.
	const shouldNotifyInitialValueChangeRef = useRef(
		!hasExplicitDefaultValueProp,
		subSlot(slot, 'notifyInitial'),
	);
	const initialDefaultValueRef = useRef(defaultValueProp, subSlot(slot, 'initialDefault'));
	const shouldHonorDisabledDefaultValueRef = useRef(
		hasExplicitDefaultValueProp,
		subSlot(slot, 'honorDisabled'),
	);
	const didRegisterTabsRef = useRef(false, subSlot(slot, 'didRegister'));

	// Uncontrolled roots own automatic fallback. Controlled roots keep exactly what the parent
	// supplied, even when that tab is disabled or missing.
	useLayoutEffect(
		() => {
			if (isControlled) {
				return;
			}

			function commitAutomaticValueChange(fallbackValue: TabsValue, fallbackReason: string) {
				setValue(fallbackValue);
				// Automatic fallbacks are not directional, so the direction resets alongside the
				// value and both land in the same commit.
				setActivationDirectionState((prev: any) => {
					if (prev.previousValue === fallbackValue && prev.tabActivationDirection === 'none') {
						return prev;
					}
					return { previousValue: fallbackValue, tabActivationDirection: 'none' };
				});
				notifyAutomaticValueChange(fallbackValue, fallbackReason);
				// Marked delivered only after the consumer callback returns: the fallback value is
				// queued first so a throwing handler cannot cancel an automatic consistency update.
				shouldNotifyInitialValueChangeRef.current = false;
			}

			if (tabMap.size === 0) {
				// A Suspense boundary above the root can tear down layout effects while leaving the
				// previous tabs connected. That is not removal.
				if (
					didRegisterTabsRef.current &&
					value !== null &&
					!(lastKnownTabElementRef.current as any)?.isConnected
				) {
					commitAutomaticValueChange(null, REASONS.missing);
				}
				return;
			}

			didRegisterTabsRef.current = true;
			lastKnownTabElementRef.current = tabMap.keys().next().value;

			const selectionIsDisabled = selectedTabMetadata?.disabled;
			const selectionIsMissing = selectedTabMetadata == null && value !== null;

			if (!selectionIsDisabled && value === initialDefaultValueRef.current) {
				shouldHonorDisabledDefaultValueRef.current = false;
			}

			if (
				shouldHonorDisabledDefaultValueRef.current &&
				selectionIsDisabled &&
				value === initialDefaultValueRef.current
			) {
				return;
			}

			const shouldNotifyInitialValueChange = shouldNotifyInitialValueChangeRef.current;

			if (selectionIsDisabled || selectionIsMissing) {
				const fallbackValue = firstEnabledTabValue ?? null;

				if (value === fallbackValue) {
					shouldNotifyInitialValueChangeRef.current = false;
					return;
				}

				let fallbackReason: string = REASONS.missing;
				if (shouldNotifyInitialValueChange) {
					fallbackReason = REASONS.initial;
				} else if (selectionIsDisabled) {
					fallbackReason = REASONS.disabled;
				}

				commitAutomaticValueChange(fallbackValue, fallbackReason);
				return;
			}

			if (shouldNotifyInitialValueChange && selectedTabMetadata != null) {
				notifyAutomaticValueChange(value, REASONS.initial);
				shouldNotifyInitialValueChangeRef.current = false;
			}
		},
		[
			firstEnabledTabValue,
			isControlled,
			notifyAutomaticValueChange,
			selectedTabMetadata,
			setValue,
			tabMap,
			value,
		],
		subSlot(slot, 'e:fallback'),
	);

	const state: TabsRootState = { orientation, tabActivationDirection };

	const element = useRenderElement(
		'div',
		{ render, className, style },
		{
			state,
			ref,
			props: elementProps,
			stateAttributesMapping: tabsStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);

	return createElement(TabsRootContext.Provider, {
		value: tabsContextValue,
		children: createElement(CompositeList, {
			elementsRef: tabPanelRefs,
			children: element,
		}),
	});
}

// --- List ---------------------------------------------------------------------

function TabsList(props: any): any {
	const slot = S('TabsList');
	const {
		activateOnFocus = false,
		className,
		loopFocus = true,
		render,
		style,
		ref,
		...elementProps
	} = props;

	const { onValueChange, orientation, value, setTabMap, tabActivationDirection } =
		useTabsRootContext();

	const [highlightedTabIndex, setHighlightedTabIndex] = useState(0, subSlot(slot, 'highlighted'));
	const [tabsListElement, setTabsListElement] = useState<HTMLElement | null>(
		null,
		subSlot(slot, 'listEl'),
	);

	const tabResizeObserverElementsRef = useRef(new Set<HTMLElement>(), subSlot(slot, 'resizeEls'));

	// Upstream keeps a ResizeObserver here to drive Indicator repositioning. Indicator is not
	// ported yet, so the registration is kept (Tab calls it unconditionally) but there is no
	// observer to attach to. Restore the observer alongside Indicator.
	const registerTabResizeObserverElement = useStableCallback(
		(element: HTMLElement) => {
			tabResizeObserverElementsRef.current.add(element);
			return () => {
				tabResizeObserverElementsRef.current.delete(element);
			};
		},
		subSlot(slot, 'registerResize'),
	);

	const onTabActivation = useStableCallback(
		(newValue: TabsValue, eventDetails: any) => {
			if (newValue !== value) {
				onValueChange(newValue, eventDetails);
			}
		},
		subSlot(slot, 'onTabActivation'),
	);

	const state: TabsRootState = { orientation, tabActivationDirection };

	const defaultProps = {
		'aria-orientation': orientation === 'vertical' ? 'vertical' : undefined,
		role: 'tablist',
	};

	const tabsListContextValue: TabsListContextValue = useMemo(
		() => ({
			activateOnFocus,
			highlightedTabIndex,
			registerTabResizeObserverElement,
			onTabActivation,
			setHighlightedTabIndex,
			tabsListElement,
		}),
		[
			activateOnFocus,
			highlightedTabIndex,
			registerTabResizeObserverElement,
			onTabActivation,
			setHighlightedTabIndex,
			tabsListElement,
		],
		subSlot(slot, 'ctx'),
	);

	return createElement(TabsListContext.Provider, {
		value: tabsListContextValue,
		children: createElement(CompositeRoot, {
			render,
			className,
			style,
			state,
			refs: [ref, setTabsListElement],
			props: [defaultProps, elementProps],
			stateAttributesMapping: tabsStateAttributesMapping,
			highlightedIndex: highlightedTabIndex,
			enableHomeAndEndKeys: true,
			loopFocus,
			orientation,
			onHighlightedIndexChange: setHighlightedTabIndex,
			onMapChange: setTabMap,
			disabledIndices: EMPTY_DISABLED_INDICES,
		}),
	});
}

// --- Tab ----------------------------------------------------------------------

function TabsTab(props: any): any {
	const slot = S('TabsTab');
	const {
		className,
		disabled = false,
		render,
		value,
		id: idProp,
		nativeButton = true,
		style,
		ref,
		...elementProps
	} = props;

	const {
		value: activeTabValue,
		getTabPanelIdByValue,
		orientation,
		tabActivationDirection,
	} = useTabsRootContext();

	const {
		activateOnFocus,
		highlightedTabIndex,
		onTabActivation,
		registerTabResizeObserverElement,
		setHighlightedTabIndex,
		tabsListElement,
	} = useTabsListContext();

	const id = useBaseUiId(idProp, subSlot(slot, 'id'));

	const tabMetadata = useMemo(
		() => ({ disabled, id, value }),
		[disabled, id, value],
		subSlot(slot, 'meta'),
	);

	// The hook rather than the CompositeItem component, because the index is needed below.
	const { compositeProps, compositeRef, index } = useCompositeItem(
		{ metadata: tabMetadata },
		subSlot(slot, 'composite'),
	);

	const active = value === activeTabValue;

	const isNavigatingRef = useRef(false, subSlot(slot, 'navigating'));
	const tabElementRef = useRef<HTMLElement | null>(null, subSlot(slot, 'tabEl'));

	useLayoutEffect(
		() => {
			const tabElement = tabElementRef.current;
			if (!tabElement) {
				return undefined;
			}
			return registerTabResizeObserverElement(tabElement);
		},
		[registerTabResizeObserverElement],
		subSlot(slot, 'e:resize'),
	);

	// Keep the roving highlight on the active tab when the value changes externally.
	useLayoutEffect(
		() => {
			if (isNavigatingRef.current) {
				isNavigatingRef.current = false;
				return;
			}

			if (!(active && index > -1 && highlightedTabIndex !== index)) {
				return;
			}

			// If focus is already inside the list, leave the roving highlight alone so keyboard
			// navigation stays relative to the focused item.
			const listElement = tabsListElement;
			if (listElement != null) {
				const activeEl = activeElement(ownerDocument(listElement));
				if (activeEl && contains(listElement, activeEl)) {
					return;
				}
			}

			// Never highlight a disabled tab: keyboard focus must stay on an enabled one even when a
			// disabled tab is selected.
			if (!disabled) {
				setHighlightedTabIndex(index);
			}
		},
		[active, index, highlightedTabIndex, setHighlightedTabIndex, disabled, tabsListElement],
		subSlot(slot, 'e:sync'),
	);

	const { getButtonProps, buttonRef } = useButton(
		{ disabled, native: nativeButton, focusableWhenDisabled: true },
		subSlot(slot, 'button'),
	);

	const tabPanelId = getTabPanelIdByValue(value);

	const isPressingRef = useRef(false, subSlot(slot, 'pressing'));
	const isMainButtonRef = useRef(false, subSlot(slot, 'mainButton'));

	function onClick(event: any) {
		if (active || disabled) {
			return;
		}
		onTabActivation(
			value,
			createChangeEventDetails(REASONS.none, event, undefined, { activationDirection: 'none' }),
		);
	}

	function onFocus(event: any) {
		if (active) {
			return;
		}

		// Only highlight enabled tabs on focus; disabled tabs stay focusable.
		if (index > -1 && !disabled) {
			setHighlightedTabIndex(index);
		}

		if (disabled) {
			return;
		}

		if (
			activateOnFocus &&
			(!isPressingRef.current || (isPressingRef.current && isMainButtonRef.current))
		) {
			onTabActivation(
				value,
				createChangeEventDetails(REASONS.none, event, undefined, { activationDirection: 'none' }),
			);
		}
	}

	function onPointerDown(event: any) {
		if (active || disabled) {
			return;
		}

		isPressingRef.current = true;

		function handlePointerUp() {
			isPressingRef.current = false;
			isMainButtonRef.current = false;
		}

		if (!event.button || event.button === 0) {
			isMainButtonRef.current = true;
			const doc = ownerDocument(event.currentTarget);
			doc.addEventListener('pointerup', handlePointerUp, { once: true });
		}
	}

	const state = { disabled, active, orientation, tabActivationDirection };

	return useRenderElement(
		'button',
		{ render, className, style },
		{
			state,
			ref: [ref, buttonRef, compositeRef, tabElementRef],
			props: [
				compositeProps,
				{
					role: 'tab',
					'aria-controls': tabPanelId,
					'aria-selected': active,
					id,
					onClick,
					onFocus,
					onPointerDown,
					[ACTIVE_COMPOSITE_ITEM]: active ? '' : undefined,
					onKeyDownCapture() {
						isNavigatingRef.current = true;
					},
				},
				elementProps,
				getButtonProps,
			],
			stateAttributesMapping: tabsStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);
}

// --- Panel --------------------------------------------------------------------

const panelStateAttributesMapping: StateAttributesMapping<any> = {
	...tabsStateAttributesMapping,
	...(transitionStatusMapping as StateAttributesMapping<any>),
};

function TabsPanel(props: any): any {
	const slot = S('TabsPanel');
	const { className, value, render, keepMounted = false, style, ref, ...elementProps } = props;

	const {
		value: selectedValue,
		getTabIdByPanelValue,
		orientation,
		tabActivationDirection,
		registerMountedTabPanel,
		unregisterMountedTabPanel,
	} = useTabsRootContext();

	const id = useBaseUiId(undefined, subSlot(slot, 'id'));

	const metadata = useMemo(() => ({ id, value }), [id, value], subSlot(slot, 'meta'));

	const { ref: listItemRef, index } = useCompositeListItem({ metadata }, subSlot(slot, 'listItem'));

	const open = value === selectedValue;
	const { mounted, transitionStatus, setMounted } = useTransitionStatus(
		open,
		subSlot(slot, 'transition'),
	);
	const hidden = !mounted;

	const correspondingTabId = getTabIdByPanelValue(value);

	const state = { hidden, orientation, tabActivationDirection, transitionStatus };

	const panelRef = useRef<HTMLElement | null>(null, subSlot(slot, 'panelRef'));

	const element = useRenderElement(
		'div',
		{ render, className, style },
		{
			state,
			ref: [ref, listItemRef, panelRef],
			props: [
				{
					'aria-labelledby': correspondingTabId,
					hidden,
					id,
					role: 'tabpanel',
					tabIndex: open ? 0 : -1,
					inert: inertValue(!open),
					'data-index': index,
				},
				elementProps,
			],
			stateAttributesMapping: panelStateAttributesMapping,
		},
		subSlot(slot, 're'),
	);

	useOpenChangeComplete(
		{
			open,
			ref: panelRef,
			onComplete() {
				if (!open) {
					setMounted(false);
				}
			},
		},
		subSlot(slot, 'openComplete'),
	);

	useLayoutEffect(
		() => {
			if (hidden && !keepMounted) {
				return undefined;
			}
			if (id == null) {
				return undefined;
			}
			registerMountedTabPanel(value, id);
			return () => {
				unregisterMountedTabPanel(value, id);
			};
		},
		[hidden, keepMounted, value, id, registerMountedTabPanel, unregisterMountedTabPanel],
		subSlot(slot, 'e:register'),
	);

	const shouldRender = keepMounted || mounted;
	if (!shouldRender) {
		return null;
	}

	return element;
}

// --- Namespace (mirrors `export * as Tabs`) -----------------------------------

export const Tabs = {
	Root: TabsRoot,
	List: TabsList,
	Tab: TabsTab,
	Panel: TabsPanel,
};

export { TabsRoot, TabsList, TabsTab, TabsPanel };
