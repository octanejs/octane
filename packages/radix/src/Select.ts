// Ported from @radix-ui/react-select (source:
// .radix-primitives/packages/react/select/src/select.tsx). A `role=combobox` trigger
// opening a popper- or item-aligned `role=listbox` content over a Collection of items,
// composing FocusScope + DismissableLayer + focus guards, with typeahead on both the
// closed trigger and the open content, ItemText portaling of the selected label into
// the trigger's value node, a detached-fragment mount that keeps items rendered while
// closed (so labels/native options stay fresh), and — inside a form — a visually hidden
// native `<select>` "bubble input" so native form machinery (FormData, validation,
// autofill, change listeners) reflects the state.
//
// octane adaptations (documented):
// - React forwardRef → `ref` destructured from props and composed via useComposedRefs.
// - `ReactDOM.createPortal` → octane `createPortal`-as-a-value, used both for the
//   detached `DocumentFragment` (SelectContentFragment) and for portaling the selected
//   ItemText into the trigger's value node.
// - Radix's `RemoveScroll` wrapper (`createSlot('SelectContent.RemoveScroll')`) is
//   replaced by the useScrollLock hook (see scroll-lock.ts); no wrapper Slot needed.
// - `SelectValue`'s `<React.Fragment key={placeholder|value}>` remount trick is dropped:
//   octane's value-hole reconciliation replaces the placeholder/value content directly.
// - The bubble `<select>`: React's `defaultValue={selectValue}` + `key={nativeSelectKey}`
//   (re-built so the default option associates) → a live CONTROLLED `value` prop:
//   octane's React-parity controlled form components re-project a select's value onto
//   its options at every commit (so late-registering options associate without a
//   rebuild) and restore it after event flushes. Value CHANGES additionally dispatch a
//   bubbling native `change` event (as in the source) so octane `<form onChange>`
//   observes them. React's synthetic `onChange` on the select is the native `change`
//   event (a `<select>` is not a text input, so no `onInput` remap).
// - jsdom-environment guards (same class as use-size.ts's ResizeObserver guard; no
//   behavior change in browsers): `hasPointerCapture`/`releasePointerCapture` and
//   `scrollIntoView` are called only when they exist.
// - Viewport's expand-on-scroll uses the `onScroll` prop directly (octane's runtime
//   capture-delegates the non-bubbling `scroll` event per-element, React 17+
//   semantics). Historical note: an addEventListener workaround predated that runtime
//   from the root and native `scroll` doesn't bubble (nor is `scroll` in the runtime's
//   fix; the Scroll{Up,Down}Button effects keep addEventListener (source parity). Same pattern
//   as the Scroll{Up,Down}Button effects and ScrollArea.
// - Fragment-position siblings (Root's children+bubble input, ItemText's span+value
//   portal, the bubble select's placeholder option) are emitted as fully-keyed arrays
//   (keyed passthrough `ValueFragment` wrappers / conditional omission instead of null
//   holes) so octane's de-opt list renderer doesn't emit its missing-key warning.
// - Dev-only warning surfaces are not ported (repo policy: functional outcomes only).
import {
	createElement,
	createPortal,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'octane';
import { hideOthers } from 'aria-hidden';

import { createCollection } from './collection';
import { composeEventHandlers } from './compose-event-handlers';
import { useComposedRefs } from './compose-refs';
import { createContextScope } from './context';
import { useDirection } from './direction';
import { DismissableLayer } from './DismissableLayer';
import { FocusScope } from './FocusScope';
import { useFocusGuards } from './focus-guards';
import { S, splitSlot, subSlot } from './internal';
import * as PopperPrimitive from './Popper';
import { createPopperScope } from './Popper';
import { Portal as PortalPrimitive } from './Portal';
import { Presence } from './Presence';
import { Primitive } from './Primitive';
import { useScrollLock } from './scroll-lock';
import { useCallbackRef } from './use-callback-ref';
import { usePrevious } from './use-previous';
import { useControllableState } from './useControllableState';
import { useId } from './useId';
import { VISUALLY_HIDDEN_STYLES } from './VisuallyHidden';

type Direction = 'ltr' | 'rtl';

const OPEN_KEYS = [' ', 'Enter', 'ArrowUp', 'ArrowDown'];
const SELECTION_KEYS = [' ', 'Enter'];

/* -------------------------------------------------------------------------------------------------
 * Select
 * -----------------------------------------------------------------------------------------------*/

const SELECT_NAME = 'Select';

const [Collection, useCollection, createCollectionScope] = createCollection(SELECT_NAME);

const [createSelectContext, createSelectScope] = createContextScope(SELECT_NAME, [
	createCollectionScope,
	createPopperScope,
]);
export { createSelectScope };
const usePopperScope = createPopperScope();

interface SelectContextValue {
	trigger: HTMLElement | null;
	onTriggerChange(node: HTMLElement | null): void;
	valueNode: HTMLElement | null;
	onValueNodeChange(node: HTMLElement | null): void;
	valueNodeHasChildren: boolean;
	onValueNodeHasChildrenChange(hasChildren: boolean): void;
	contentId: string;
	value: string | undefined;
	onValueChange(value: string): void;
	open: boolean;
	required?: boolean;
	onOpenChange(open: boolean): void;
	dir: Direction;
	triggerPointerDownPosRef: { current: { x: number; y: number } | null };
	disabled?: boolean;
	name?: string;
	autoComplete?: string;
	form?: string;
	// Native `<option>` element descriptors registered by mounted ItemTexts.
	nativeOptions: Set<any>;
	isFormControl: boolean;
}

const [SelectProviderImpl, useSelectContext] = createSelectContext<SelectContextValue>(SELECT_NAME);

interface SelectNativeOptionsContextValue {
	onNativeOptionAdd(option: any): void;
	onNativeOptionRemove(option: any): void;
}
const [SelectNativeOptionsProvider, useSelectNativeOptionsContext] =
	createSelectContext<SelectNativeOptionsContextValue>(SELECT_NAME);

/* -------------------------------------------------------------------------------------------------
 * SelectProvider
 * -----------------------------------------------------------------------------------------------*/

const PROVIDER_NAME = 'SelectProvider';

export function Provider(props: any): any {
	const slot = S('Select.Provider');
	const {
		__scopeSelect,
		children,
		open: openProp,
		defaultOpen,
		onOpenChange,
		value: valueProp,
		defaultValue,
		onValueChange,
		dir,
		name,
		autoComplete,
		disabled,
		required,
		form,
		// internal render prop used by `Select` (Root) to compose its default parts
		internal_do_not_use_render,
	} = props ?? {};
	const popperScope = usePopperScope(__scopeSelect, subSlot(slot, 'popper'));
	const [trigger, setTrigger] = useState<HTMLElement | null>(null, subSlot(slot, 'trigger'));
	const [valueNode, setValueNode] = useState<HTMLElement | null>(null, subSlot(slot, 'valueNode'));
	const [valueNodeHasChildren, setValueNodeHasChildren] = useState(
		false,
		subSlot(slot, 'hasChildren'),
	);
	const direction = useDirection(dir);
	const [open, setOpen] = useControllableState<boolean>(
		{ prop: openProp, defaultProp: defaultOpen ?? false, onChange: onOpenChange },
		subSlot(slot, 'open'),
	);
	const [value, setValue] = useControllableState<string | undefined>(
		{ prop: valueProp, defaultProp: defaultValue, onChange: onValueChange },
		subSlot(slot, 'value'),
	);
	const triggerPointerDownPosRef = useRef<{ x: number; y: number } | null>(
		null,
		subSlot(slot, 'pointerPos'),
	);

	// We set this to true by default so that events bubble to forms without JS (SSR)
	const isFormControl = trigger ? !!form || !!trigger.closest('form') : true;
	const [nativeOptionsSet, setNativeOptionsSet] = useState<Set<any>>(
		new Set(),
		subSlot(slot, 'options'),
	);
	const contentId = useId(subSlot(slot, 'contentId'));

	const handleNativeOptionAdd = useCallback(
		(option: any) => {
			setNativeOptionsSet((prev: Set<any>) => new Set(prev).add(option));
		},
		[],
		subSlot(slot, 'optAdd'),
	);

	const handleNativeOptionRemove = useCallback(
		(option: any) => {
			setNativeOptionsSet((prev: Set<any>) => {
				const optionsSet = new Set(prev);
				optionsSet.delete(option);
				return optionsSet;
			});
		},
		[],
		subSlot(slot, 'optRemove'),
	);

	const context: SelectContextValue = {
		required,
		trigger,
		onTriggerChange: setTrigger,
		valueNode,
		onValueNodeChange: setValueNode,
		valueNodeHasChildren,
		onValueNodeHasChildrenChange: setValueNodeHasChildren,
		contentId,
		value,
		onValueChange: setValue as (value: string) => void,
		open,
		onOpenChange: setOpen,
		dir: direction,
		triggerPointerDownPosRef,
		disabled,
		name,
		autoComplete,
		form,
		nativeOptions: nativeOptionsSet,
		isFormControl,
	};

	return createElement(PopperPrimitive.Root, {
		...popperScope,
		children: createElement(SelectProviderImpl, {
			scope: __scopeSelect,
			...context,
			children: createElement(Collection.Provider, {
				scope: __scopeSelect,
				children: createElement(SelectNativeOptionsProvider, {
					scope: __scopeSelect,
					onNativeOptionAdd: handleNativeOptionAdd,
					onNativeOptionRemove: handleNativeOptionRemove,
					children: isFunction(internal_do_not_use_render)
						? internal_do_not_use_render(context)
						: children,
				}),
			}),
		}),
	});
}

/* -------------------------------------------------------------------------------------------------
 * Select (Root)
 * -----------------------------------------------------------------------------------------------*/

export function Root(props: any): any {
	const { __scopeSelect, children, ...providerProps } = props ?? {};
	return createElement(Provider, {
		__scopeSelect,
		...providerProps,
		// Every array entry is keyed (unkeyed/null entries would trip octane's one-time
		// missing-key warning in the de-opt list renderer); `children` rides through a
		// keyed passthrough component, and the bubble input is simply omitted when the
		// select isn't a form control — these are fixed-position siblings.
		internal_do_not_use_render: (context: SelectContextValue) => {
			const nodes: any[] = [createElement(ValueFragment, { key: 'children', children })];
			if (context.isFormControl) {
				nodes.push(createElement(BubbleInput, { key: 'bubble', __scopeSelect }));
			}
			return nodes;
		},
	});
}

/* -------------------------------------------------------------------------------------------------
 * SelectTrigger
 * -----------------------------------------------------------------------------------------------*/

const TRIGGER_NAME = 'SelectTrigger';

export function Trigger(props: any): any {
	const slot = S('Select.Trigger');
	const { __scopeSelect, disabled = false, ref: forwardedRef, ...triggerProps } = props ?? {};
	const popperScope = usePopperScope(__scopeSelect, subSlot(slot, 'popper'));
	const context = useSelectContext(TRIGGER_NAME, __scopeSelect);
	const isDisabled = context.disabled || disabled;
	const composedRefs = useComposedRefs(
		forwardedRef,
		context.onTriggerChange,
		subSlot(slot, 'refs'),
	);
	const getItems = useCollection(__scopeSelect, subSlot(slot, 'items'));
	const pointerTypeRef = useRef<string>('touch', subSlot(slot, 'pointerType'));

	const [searchRef, handleTypeaheadSearch, resetTypeahead] = useTypeaheadSearch(
		(search: string) => {
			const enabledItems = getItems().filter((item: any) => !item.disabled);
			const currentItem = enabledItems.find((item: any) => item.value === context.value);
			const nextItem = findNextItem(enabledItems, search, currentItem);
			if (nextItem !== undefined) {
				context.onValueChange(nextItem.value);
			}
		},
		subSlot(slot, 'typeahead'),
	);

	const handleOpen = (pointerEvent?: MouseEvent | PointerEvent): void => {
		if (!isDisabled) {
			context.onOpenChange(true);
			// reset typeahead when we open
			resetTypeahead();
		}

		if (pointerEvent) {
			context.triggerPointerDownPosRef.current = {
				x: Math.round(pointerEvent.pageX),
				y: Math.round(pointerEvent.pageY),
			};
		}
	};

	return createElement(PopperPrimitive.Anchor, {
		asChild: true,
		...popperScope,
		children: createElement(Primitive.button, {
			type: 'button',
			role: 'combobox',
			'aria-controls': context.open ? context.contentId : undefined,
			'aria-expanded': context.open,
			'aria-required': context.required,
			'aria-autocomplete': 'none',
			dir: context.dir,
			'data-state': context.open ? 'open' : 'closed',
			disabled: isDisabled,
			'data-disabled': isDisabled ? '' : undefined,
			'data-placeholder': shouldShowPlaceholder(context.value) ? '' : undefined,
			...triggerProps,
			ref: composedRefs,
			// Enable compatibility with native label or custom `Label` "click" for Safari:
			onClick: composeEventHandlers(triggerProps.onClick, (event: MouseEvent) => {
				// Whilst browsers generally have no issue focusing the trigger when clicking
				// on a label, Safari seems to struggle with the fact that there's no `onClick`.
				// We force `focus` in this case. Note: this doesn't create any other side-effect
				// because we are preventing default in `onPointerDown` so effectively
				// this only runs for a label "click"
				(event.currentTarget as HTMLElement).focus();

				// Open on click when using a touch or pen device
				if (pointerTypeRef.current !== 'mouse') {
					handleOpen(event);
				}
			}),
			onPointerDown: composeEventHandlers(triggerProps.onPointerDown, (event: PointerEvent) => {
				pointerTypeRef.current = event.pointerType;

				// prevent implicit pointer capture
				// https://www.w3.org/TR/pointerevents3/#implicit-pointer-capture
				// (guarded: jsdom lacks the pointer-capture APIs)
				const target = event.target as HTMLElement;
				if (
					typeof target.hasPointerCapture === 'function' &&
					target.hasPointerCapture(event.pointerId)
				) {
					target.releasePointerCapture(event.pointerId);
				}

				// only call handler if it's the left button (mousedown gets triggered by all mouse buttons)
				// but not when the control key is pressed (avoiding MacOS right click); also not for touch
				// devices because that would open the menu on scroll. (pen devices behave as touch on iOS).
				if (event.button === 0 && event.ctrlKey === false && event.pointerType === 'mouse') {
					handleOpen(event);
					// prevent trigger from stealing focus from the active item after opening.
					event.preventDefault();
				}
			}),
			onKeyDown: composeEventHandlers(triggerProps.onKeyDown, (event: KeyboardEvent) => {
				const isTypingAhead = searchRef.current !== '';
				const isModifierKey = event.ctrlKey || event.altKey || event.metaKey;
				if (!isModifierKey && event.key.length === 1) handleTypeaheadSearch(event.key);
				if (isTypingAhead && event.key === ' ') return;
				if (OPEN_KEYS.includes(event.key)) {
					handleOpen();
					event.preventDefault();
				}
			}),
		}),
	});
}

/* -------------------------------------------------------------------------------------------------
 * SelectValue
 * -----------------------------------------------------------------------------------------------*/

const VALUE_NAME = 'SelectValue';

export function Value(props: any): any {
	const slot = S('Select.Value');
	// We ignore `className` and `style` as this part shouldn't be styled.
	const {
		__scopeSelect,
		className,
		style,
		children,
		placeholder = '',
		ref: forwardedRef,
		...valueProps
	} = props ?? {};
	void className;
	void style;
	const context = useSelectContext(VALUE_NAME, __scopeSelect);
	const { onValueNodeHasChildrenChange } = context;
	const hasChildren = children !== undefined;
	const composedRefs = useComposedRefs(
		forwardedRef,
		context.onValueNodeChange,
		subSlot(slot, 'refs'),
	);

	useLayoutEffect(
		() => {
			onValueNodeHasChildrenChange(hasChildren);
		},
		[onValueNodeHasChildrenChange, hasChildren],
		subSlot(slot, 'e:hasChildren'),
	);

	const showPlaceholder = shouldShowPlaceholder(context.value);

	return createElement(Primitive.span, {
		...valueProps,
		asChild: showPlaceholder ? false : valueProps.asChild,
		ref: composedRefs,
		// we don't want events from the portalled `SelectValue` children to bubble
		// through the item they came from
		style: { pointerEvents: 'none' },
		// The source wraps in `<React.Fragment key={placeholder|value}>`. The component
		// wrapper here doubles as an octane adaptation: it forces the span's children
		// through the BLOCK (marker-delimited) render path, so the ItemText content
		// portal'd into this span from elsewhere isn't swept by the raw host
		// reconciler (see suspected-bug note in the port summary).
		children: createElement(ValueFragment, {
			key: showPlaceholder ? 'placeholder' : 'value',
			children: showPlaceholder ? placeholder : children,
		}),
	});
}

function ValueFragment(props: any): any {
	return props?.children ?? null;
}

/* -------------------------------------------------------------------------------------------------
 * SelectIcon
 * -----------------------------------------------------------------------------------------------*/

export function Icon(props: any): any {
	const { __scopeSelect, children, ...iconProps } = props ?? {};
	return createElement(Primitive.span, {
		'aria-hidden': true,
		...iconProps,
		children: children || '▼',
	});
}

/* -------------------------------------------------------------------------------------------------
 * SelectPortal
 * -----------------------------------------------------------------------------------------------*/

const PORTAL_NAME = 'SelectPortal';

interface PortalContextValue {
	forceMount?: true;
}
const [PortalProvider, usePortalContext] = createSelectContext<PortalContextValue>(PORTAL_NAME, {
	forceMount: undefined,
});

/**
 * octane children convention: pass enumerable children at a prop/value position
 * (`children={[<Content/>]}`); a function child is portal'd as a single unit.
 */
export function Portal(props: any): any {
	const { __scopeSelect, forceMount, children, ...portalProps } = props ?? {};
	return createElement(PortalProvider, {
		scope: __scopeSelect,
		forceMount,
		children: createElement(PortalPrimitive, {
			asChild: typeof children !== 'function',
			...portalProps,
			children,
		}),
	});
}

/* -------------------------------------------------------------------------------------------------
 * SelectContent
 * -----------------------------------------------------------------------------------------------*/

const CONTENT_NAME = 'SelectContent';

export function Content(props: any): any {
	const slot = S('Select.Content');
	const portalContext = usePortalContext(CONTENT_NAME, props?.__scopeSelect);
	const { forceMount = portalContext.forceMount, ref: forwardedRef, ...contentProps } = props ?? {};
	const context = useSelectContext(CONTENT_NAME, props?.__scopeSelect);
	const [fragment, setFragment] = useState<DocumentFragment | undefined>(
		undefined,
		subSlot(slot, 'fragment'),
	);

	// setting the fragment in `useLayoutEffect` as `DocumentFragment` doesn't exist on the server
	useLayoutEffect(
		() => {
			setFragment(new DocumentFragment());
		},
		[],
		subSlot(slot, 'e:fragment'),
	);

	// The `Select` items collect their data (e.g. to build the native `option`s
	// and to display the selected value) by mounting their children. We keep
	// them mounted in a detached fragment whenever the content isn't present so
	// that this data stays up to date even while the select is closed (or
	// animating out).
	return createElement(Presence, {
		present: forceMount || context.open,
		children: ({ present }: { present: boolean }) =>
			present
				? createElement(ContentImpl, { ...contentProps, ref: forwardedRef })
				: createElement(ContentFragment, { ...contentProps, fragment }),
	});
}

/* -------------------------------------------------------------------------------------------------
 * SelectContentFragment
 * -----------------------------------------------------------------------------------------------*/

function ContentFragment(props: any): any {
	const { __scopeSelect, children, fragment, ref: forwardedRef } = props ?? {};
	if (!fragment) return null;

	return createPortal(
		createElement(SelectContentProvider, {
			scope: __scopeSelect,
			children: createElement(Collection.Slot, {
				scope: __scopeSelect,
				children: createElement('div', { ref: forwardedRef, children }),
			}),
		}),
		// octane's createPortal target is typed as Element; a detached DocumentFragment
		// works identically (appendChild + EventTarget for delegated listeners).
		fragment as any,
	);
}

/* -------------------------------------------------------------------------------------------------
 * SelectContentImpl
 * -----------------------------------------------------------------------------------------------*/

const CONTENT_MARGIN = 10;

interface SelectContentContextValue {
	content?: HTMLElement | null;
	viewport?: HTMLElement | null;
	onViewportChange?: (node: HTMLElement | null) => void;
	itemRefCallback?: (node: HTMLElement | null, value: string, disabled: boolean) => void;
	selectedItem?: HTMLElement | null;
	onItemLeave?: () => void;
	itemTextRefCallback?: (node: HTMLElement | null, value: string, disabled: boolean) => void;
	focusSelectedItem?: () => void;
	selectedItemText?: HTMLElement | null;
	position?: 'item-aligned' | 'popper';
	isPositioned?: boolean;
	searchRef?: { current: string };
}

const [SelectContentProvider, useSelectContentContext] =
	createSelectContext<SelectContentContextValue>(CONTENT_NAME);

const CONTENT_IMPL_NAME = 'SelectContentImpl';

function ContentImpl(props: any): any {
	const slot = S('Select.ContentImpl');
	const {
		__scopeSelect,
		position = 'item-aligned',
		onCloseAutoFocus,
		onEscapeKeyDown,
		onPointerDownOutside,
		//
		// PopperContent props
		side,
		sideOffset,
		align,
		alignOffset,
		arrowPadding,
		collisionBoundary,
		collisionPadding,
		sticky,
		hideWhenDetached,
		avoidCollisions,
		//
		ref: forwardedRef,
		...contentProps
	} = props;
	const context = useSelectContext(CONTENT_NAME, __scopeSelect);
	const [content, setContent] = useState<HTMLElement | null>(null, subSlot(slot, 'content'));
	const [viewport, setViewport] = useState<HTMLElement | null>(null, subSlot(slot, 'viewport'));
	const composedRefs = useComposedRefs(forwardedRef, setContent, subSlot(slot, 'refs'));
	const [selectedItem, setSelectedItem] = useState<HTMLElement | null>(
		null,
		subSlot(slot, 'selItem'),
	);
	const [selectedItemText, setSelectedItemText] = useState<HTMLElement | null>(
		null,
		subSlot(slot, 'selText'),
	);
	const getItems = useCollection(__scopeSelect, subSlot(slot, 'items'));
	const [isPositioned, setIsPositioned] = useState(false, subSlot(slot, 'positioned'));
	const firstValidItemFoundRef = useRef(false, subSlot(slot, 'firstValid'));

	// aria-hide everything except the content (better supported equivalent to setting aria-modal)
	useEffect(
		() => {
			if (content) return hideOthers(content);
		},
		[content],
		subSlot(slot, 'e:hide'),
	);

	// Make sure the whole tree has focus guards as our `Select` may be
	// the last element in the DOM (because of the `Portal`)
	useFocusGuards(subSlot(slot, 'guards'));

	const focusFirst = useCallback(
		(candidates: Array<HTMLElement | null>) => {
			const [firstItem, ...restItems] = getItems().map((item: any) => item.ref.current);
			const [lastItem] = restItems.slice(-1);

			const PREVIOUSLY_FOCUSED_ELEMENT = document.activeElement;
			for (const candidate of candidates) {
				// if focus is already where we want to go, we don't want to keep going through the candidates
				if (candidate === PREVIOUSLY_FOCUSED_ELEMENT) return;
				// (guarded: jsdom lacks scrollIntoView)
				candidate?.scrollIntoView?.({ block: 'nearest' });
				// viewport might have padding so scroll to its edges when focusing first/last items.
				if (candidate === firstItem && viewport) viewport.scrollTop = 0;
				if (candidate === lastItem && viewport) viewport.scrollTop = viewport.scrollHeight;
				candidate?.focus();
				if (document.activeElement !== PREVIOUSLY_FOCUSED_ELEMENT) return;
			}
		},
		[getItems, viewport],
		subSlot(slot, 'focusFirst'),
	);

	const focusSelectedItem = useCallback(
		() => focusFirst([selectedItem, content]),
		[focusFirst, selectedItem, content],
		subSlot(slot, 'focusSel'),
	);

	// Since this is not dependent on layout, we want to ensure this runs at the same time as
	// other effects across components. Hence why we don't call `focusSelectedItem` inside `position`.
	useEffect(
		() => {
			if (isPositioned) {
				focusSelectedItem();
			}
		},
		[isPositioned, focusSelectedItem],
		subSlot(slot, 'e:focus'),
	);

	// prevent selecting items on `pointerup` in some cases after opening from `pointerdown`
	// and close on `pointerup` outside.
	const { onOpenChange, triggerPointerDownPosRef } = context;
	useEffect(
		() => {
			if (content) {
				let pointerMoveDelta = { x: 0, y: 0 };

				const handlePointerMove = (event: PointerEvent): void => {
					pointerMoveDelta = {
						x: Math.abs(Math.round(event.pageX) - (triggerPointerDownPosRef.current?.x ?? 0)),
						y: Math.abs(Math.round(event.pageY) - (triggerPointerDownPosRef.current?.y ?? 0)),
					};
				};
				const handlePointerUp = (event: PointerEvent): void => {
					// If the pointer hasn't moved by a certain threshold then we prevent selecting item on `pointerup`.
					if (pointerMoveDelta.x <= 10 && pointerMoveDelta.y <= 10) {
						event.preventDefault();
					} else {
						// otherwise, if the event was outside the content, close.
						// `event.target` is retargeted to the shadow host for this
						// document-level listener, so use `composedPath()` which pierces
						// open shadow roots to reliably detect events inside the content.
						if (!event.composedPath().includes(content)) {
							onOpenChange(false);
						}
					}
					document.removeEventListener('pointermove', handlePointerMove);
					triggerPointerDownPosRef.current = null;
				};

				if (triggerPointerDownPosRef.current !== null) {
					document.addEventListener('pointermove', handlePointerMove);
					document.addEventListener('pointerup', handlePointerUp, { capture: true, once: true });
				}

				return () => {
					document.removeEventListener('pointermove', handlePointerMove);
					document.removeEventListener('pointerup', handlePointerUp, { capture: true });
				};
			}
		},
		[content, onOpenChange, triggerPointerDownPosRef],
		subSlot(slot, 'e:pointer'),
	);

	useEffect(
		() => {
			const close = (): void => onOpenChange(false);
			window.addEventListener('blur', close);
			window.addEventListener('resize', close);
			return () => {
				window.removeEventListener('blur', close);
				window.removeEventListener('resize', close);
			};
		},
		[onOpenChange],
		subSlot(slot, 'e:close'),
	);

	const [searchRef, handleTypeaheadSearch] = useTypeaheadSearch(
		(search: string) => {
			const enabledItems = getItems().filter((item: any) => !item.disabled);
			const currentItem = enabledItems.find(
				(item: any) => item.ref.current === document.activeElement,
			);
			const nextItem = findNextItem(enabledItems, search, currentItem);
			if (nextItem) {
				// Imperative focus during keydown is risky so we defer it (React #20332).
				setTimeout(() => (nextItem.ref.current as HTMLElement | null)?.focus());
			}
		},
		subSlot(slot, 'typeahead'),
	);

	const itemRefCallback = useCallback(
		(node: HTMLElement | null, value: string, disabled: boolean) => {
			const isFirstValidItem = !firstValidItemFoundRef.current && !disabled;
			const isSelectedItem = context.value !== undefined && context.value === value;
			if (isSelectedItem || isFirstValidItem) {
				setSelectedItem(node);
				if (isFirstValidItem) firstValidItemFoundRef.current = true;
			}
		},
		[context.value],
		subSlot(slot, 'itemRef'),
	);
	const handleItemLeave = useCallback(
		() => content?.focus(),
		[content],
		subSlot(slot, 'itemLeave'),
	);
	const itemTextRefCallback = useCallback(
		(node: HTMLElement | null, value: string, disabled: boolean) => {
			const isFirstValidItem = !firstValidItemFoundRef.current && !disabled;
			const isSelectedItem = context.value !== undefined && context.value === value;
			if (isSelectedItem || isFirstValidItem) {
				setSelectedItemText(node);
			}
		},
		[context.value],
		subSlot(slot, 'itemTextRef'),
	);

	// Radix wraps the content in `react-remove-scroll` (as a Slot — no wrapper DOM); the
	// octane equivalent is the useScrollLock hook (see scroll-lock.ts).
	useScrollLock(true, subSlot(slot, 'lock'));

	const SelectPosition = position === 'popper' ? PopperPosition : ItemAlignedPosition;

	// Silently ignore props that are not supported by `SelectItemAlignedPosition`
	const popperContentProps =
		SelectPosition === PopperPosition
			? {
					side,
					sideOffset,
					align,
					alignOffset,
					arrowPadding,
					collisionBoundary,
					collisionPadding,
					sticky,
					hideWhenDetached,
					avoidCollisions,
				}
			: {};

	return createElement(SelectContentProvider, {
		scope: __scopeSelect,
		content,
		viewport,
		onViewportChange: setViewport,
		itemRefCallback,
		selectedItem,
		onItemLeave: handleItemLeave,
		itemTextRefCallback,
		focusSelectedItem,
		selectedItemText,
		position,
		isPositioned,
		searchRef,
		children: createElement(FocusScope, {
			asChild: true,
			// we make sure we're not trapping once it's been closed
			// (closed !== unmounted when animating out)
			trapped: context.open,
			onMountAutoFocus: (event: Event) => {
				// we prevent open autofocus because we manually focus the selected item
				event.preventDefault();
			},
			onUnmountAutoFocus: composeEventHandlers(onCloseAutoFocus, (event: Event) => {
				context.trigger?.focus({ preventScroll: true } as FocusOptions);
				event.preventDefault();
			}),
			children: createElement(DismissableLayer, {
				asChild: true,
				disableOutsidePointerEvents: true,
				onEscapeKeyDown,
				onPointerDownOutside,
				// When focus is trapped, a focusout event may still happen.
				// We make sure we don't trigger our `onDismiss` in such case.
				onFocusOutside: (event: Event) => event.preventDefault(),
				onDismiss: () => context.onOpenChange(false),
				children: createElement(SelectPosition, {
					role: 'listbox',
					id: context.contentId,
					'data-state': context.open ? 'open' : 'closed',
					dir: context.dir,
					onContextMenu: (event: Event) => event.preventDefault(),
					...contentProps,
					...popperContentProps,
					__scopeSelect,
					onPlaced: () => setIsPositioned(true),
					ref: composedRefs,
					style: {
						// flex layout so we can place the scroll buttons properly
						display: 'flex',
						flexDirection: 'column',
						// reset the outline by default as the content MAY get focused
						outline: 'none',
						...contentProps.style,
					},
					onKeyDown: composeEventHandlers(contentProps.onKeyDown, (event: KeyboardEvent) => {
						const isModifierKey = event.ctrlKey || event.altKey || event.metaKey;

						// select should not be navigated using tab key so we prevent it
						if (event.key === 'Tab') event.preventDefault();

						if (!isModifierKey && event.key.length === 1) handleTypeaheadSearch(event.key);

						if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
							const items = getItems().filter((item: any) => !item.disabled);
							let candidateNodes = items.map((item: any) => item.ref.current!);

							if (['ArrowUp', 'End'].includes(event.key)) {
								candidateNodes = candidateNodes.slice().reverse();
							}
							if (['ArrowUp', 'ArrowDown'].includes(event.key)) {
								const currentElement = event.target as HTMLElement;
								const currentIndex = candidateNodes.indexOf(currentElement);
								candidateNodes = candidateNodes.slice(currentIndex + 1);
							}

							// Imperative focus during keydown is risky so we defer it (React #20332).
							setTimeout(() => focusFirst(candidateNodes));

							event.preventDefault();
						}
					}),
				}),
			}),
		}),
	});
}

/* -------------------------------------------------------------------------------------------------
 * SelectItemAlignedPosition
 * -----------------------------------------------------------------------------------------------*/

const ITEM_ALIGNED_POSITION_NAME = 'SelectItemAlignedPosition';

function ItemAlignedPosition(props: any): any {
	const slot = S('Select.ItemAlignedPosition');
	const { __scopeSelect, onPlaced, ref: forwardedRef, ...popperProps } = props;
	const context = useSelectContext(CONTENT_NAME, __scopeSelect);
	const contentContext = useSelectContentContext(CONTENT_NAME, __scopeSelect);
	const [contentWrapper, setContentWrapper] = useState<HTMLDivElement | null>(
		null,
		subSlot(slot, 'wrapper'),
	);
	const [content, setContent] = useState<HTMLElement | null>(null, subSlot(slot, 'content'));
	const composedRefs = useComposedRefs(forwardedRef, setContent, subSlot(slot, 'refs'));
	const getItems = useCollection(__scopeSelect, subSlot(slot, 'items'));
	const shouldExpandOnScrollRef = useRef(false, subSlot(slot, 'expand'));
	const shouldRepositionRef = useRef(true, subSlot(slot, 'reposition'));

	const { viewport, selectedItem, selectedItemText, focusSelectedItem } = contentContext;
	const position = useCallback(
		() => {
			if (
				context.trigger &&
				context.valueNode &&
				contentWrapper &&
				content &&
				viewport &&
				selectedItem &&
				selectedItemText
			) {
				const triggerRect = context.trigger.getBoundingClientRect();

				// -----------------------------------------------------------------------------------------
				//  Horizontal positioning
				// -----------------------------------------------------------------------------------------
				const contentRect = content.getBoundingClientRect();
				const valueNodeRect = context.valueNode.getBoundingClientRect();
				const itemTextRect = selectedItemText.getBoundingClientRect();

				if (context.dir !== 'rtl') {
					const itemTextOffset = itemTextRect.left - contentRect.left;
					const left = valueNodeRect.left - itemTextOffset;
					const leftDelta = triggerRect.left - left;
					const minContentWidth = triggerRect.width + leftDelta;
					const contentWidth = Math.max(minContentWidth, contentRect.width);
					const rightEdge = window.innerWidth - CONTENT_MARGIN;
					const clampedLeft = clamp(left, [
						CONTENT_MARGIN,
						// Prevents the content from going off the starting edge of the
						// viewport. It may still go off the ending edge, but this can be
						// controlled by the user since they may want to manage overflow in a
						// specific way.
						// https://github.com/radix-ui/primitives/issues/2049
						Math.max(CONTENT_MARGIN, rightEdge - contentWidth),
					]);

					contentWrapper.style.minWidth = minContentWidth + 'px';
					contentWrapper.style.left = clampedLeft + 'px';
				} else {
					const itemTextOffset = contentRect.right - itemTextRect.right;
					const right = window.innerWidth - valueNodeRect.right - itemTextOffset;
					const rightDelta = window.innerWidth - triggerRect.right - right;
					const minContentWidth = triggerRect.width + rightDelta;
					const contentWidth = Math.max(minContentWidth, contentRect.width);
					const leftEdge = window.innerWidth - CONTENT_MARGIN;
					const clampedRight = clamp(right, [
						CONTENT_MARGIN,
						Math.max(CONTENT_MARGIN, leftEdge - contentWidth),
					]);

					contentWrapper.style.minWidth = minContentWidth + 'px';
					contentWrapper.style.right = clampedRight + 'px';
				}

				// -----------------------------------------------------------------------------------------
				// Vertical positioning
				// -----------------------------------------------------------------------------------------
				const items = getItems();
				const availableHeight = window.innerHeight - CONTENT_MARGIN * 2;
				const itemsHeight = viewport.scrollHeight;

				const contentStyles = window.getComputedStyle(content);
				const contentBorderTopWidth = parseInt(contentStyles.borderTopWidth, 10);
				const contentPaddingTop = parseInt(contentStyles.paddingTop, 10);
				const contentBorderBottomWidth = parseInt(contentStyles.borderBottomWidth, 10);
				const contentPaddingBottom = parseInt(contentStyles.paddingBottom, 10);
				const fullContentHeight = contentBorderTopWidth + contentPaddingTop + itemsHeight + contentPaddingBottom + contentBorderBottomWidth; // prettier-ignore
				const minContentHeight = Math.min(selectedItem.offsetHeight * 5, fullContentHeight);

				const viewportStyles = window.getComputedStyle(viewport);
				const viewportPaddingTop = parseInt(viewportStyles.paddingTop, 10);
				const viewportPaddingBottom = parseInt(viewportStyles.paddingBottom, 10);

				const topEdgeToTriggerMiddle = triggerRect.top + triggerRect.height / 2 - CONTENT_MARGIN;
				const triggerMiddleToBottomEdge = availableHeight - topEdgeToTriggerMiddle;

				const selectedItemHalfHeight = selectedItem.offsetHeight / 2;
				const itemOffsetMiddle = selectedItem.offsetTop + selectedItemHalfHeight;
				const contentTopToItemMiddle = contentBorderTopWidth + contentPaddingTop + itemOffsetMiddle;
				const itemMiddleToContentBottom = fullContentHeight - contentTopToItemMiddle;

				const willAlignWithoutTopOverflow = contentTopToItemMiddle <= topEdgeToTriggerMiddle;

				if (willAlignWithoutTopOverflow) {
					const isLastItem =
						items.length > 0 && selectedItem === items[items.length - 1]!.ref.current;
					contentWrapper.style.bottom = 0 + 'px';
					const viewportOffsetBottom =
						content.clientHeight - viewport.offsetTop - viewport.offsetHeight;
					const clampedTriggerMiddleToBottomEdge = Math.max(
						triggerMiddleToBottomEdge,
						selectedItemHalfHeight +
							// viewport might have padding bottom, include it to avoid a scrollable viewport
							(isLastItem ? viewportPaddingBottom : 0) +
							viewportOffsetBottom +
							contentBorderBottomWidth,
					);
					const height = contentTopToItemMiddle + clampedTriggerMiddleToBottomEdge;
					contentWrapper.style.height = height + 'px';
				} else {
					const isFirstItem = items.length > 0 && selectedItem === items[0]!.ref.current;
					contentWrapper.style.top = 0 + 'px';
					const clampedTopEdgeToTriggerMiddle = Math.max(
						topEdgeToTriggerMiddle,
						contentBorderTopWidth +
							viewport.offsetTop +
							// viewport might have padding top, include it to avoid a scrollable viewport
							(isFirstItem ? viewportPaddingTop : 0) +
							selectedItemHalfHeight,
					);
					const height = clampedTopEdgeToTriggerMiddle + itemMiddleToContentBottom;
					contentWrapper.style.height = height + 'px';
					viewport.scrollTop = contentTopToItemMiddle - topEdgeToTriggerMiddle + viewport.offsetTop;
				}

				contentWrapper.style.margin = `${CONTENT_MARGIN}px 0`;
				contentWrapper.style.minHeight = minContentHeight + 'px';
				contentWrapper.style.maxHeight = availableHeight + 'px';
				// -----------------------------------------------------------------------------------------

				onPlaced?.();

				// we don't want the initial scroll position adjustment to trigger "expand on scroll"
				// so we explicitly turn it on only after they've registered.
				requestAnimationFrame(() => (shouldExpandOnScrollRef.current = true));
			}
		},
		[
			getItems,
			context.trigger,
			context.valueNode,
			contentWrapper,
			content,
			viewport,
			selectedItem,
			selectedItemText,
			context.dir,
			onPlaced,
		],
		subSlot(slot, 'position'),
	);

	useLayoutEffect(() => position(), [position], subSlot(slot, 'e:position'));

	// copy z-index from content to wrapper
	const [contentZIndex, setContentZIndex] = useState<string | undefined>(
		undefined,
		subSlot(slot, 'zIndex'),
	);
	useLayoutEffect(
		() => {
			if (content) setContentZIndex(window.getComputedStyle(content).zIndex);
		},
		[content],
		subSlot(slot, 'e:zIndex'),
	);

	// When the viewport becomes scrollable at the top, the scroll up button will mount.
	// Because it is part of the normal flow, it will push down the viewport, thus throwing our
	// trigger => selectedItem alignment off by the amount the viewport was pushed down.
	// We wait for this to happen and then re-run the positining logic one more time to account for it.
	const handleScrollButtonChange = useCallback(
		(node: HTMLElement | null) => {
			if (node && shouldRepositionRef.current === true) {
				position();
				focusSelectedItem?.();
				shouldRepositionRef.current = false;
			}
		},
		[position, focusSelectedItem],
		subSlot(slot, 'scrollBtn'),
	);

	return createElement(SelectViewportProvider, {
		scope: __scopeSelect,
		contentWrapper,
		shouldExpandOnScrollRef,
		onScrollButtonChange: handleScrollButtonChange,
		children: createElement('div', {
			ref: setContentWrapper,
			style: {
				display: 'flex',
				flexDirection: 'column',
				position: 'fixed',
				zIndex: contentZIndex,
			},
			children: createElement(Primitive.div, {
				...popperProps,
				ref: composedRefs,
				style: {
					// When we get the height of the content, it includes borders. If we were to set
					// the height without having `boxSizing: 'border-box'` it would be too big.
					boxSizing: 'border-box',
					// We need to ensure the content doesn't get taller than the wrapper
					maxHeight: '100%',
					...popperProps.style,
				},
			}),
		}),
	});
}

/* -------------------------------------------------------------------------------------------------
 * SelectPopperPosition
 * -----------------------------------------------------------------------------------------------*/

function PopperPosition(props: any): any {
	const slot = S('Select.PopperPosition');
	const {
		__scopeSelect,
		align = 'start',
		collisionPadding = CONTENT_MARGIN,
		...popperProps
	} = props ?? {};
	const popperScope = usePopperScope(__scopeSelect, subSlot(slot, 'popper'));

	return createElement(PopperPrimitive.Content, {
		...popperScope,
		...popperProps,
		align,
		collisionPadding,
		style: {
			// Ensure border-box for floating-ui calculations
			boxSizing: 'border-box',
			...popperProps.style,
			// re-namespace exposed content custom properties
			'--radix-select-content-transform-origin': 'var(--radix-popper-transform-origin)',
			'--radix-select-content-available-width': 'var(--radix-popper-available-width)',
			'--radix-select-content-available-height': 'var(--radix-popper-available-height)',
			'--radix-select-trigger-width': 'var(--radix-popper-anchor-width)',
			'--radix-select-trigger-height': 'var(--radix-popper-anchor-height)',
		},
	});
}

/* -------------------------------------------------------------------------------------------------
 * SelectViewport
 * -----------------------------------------------------------------------------------------------*/

interface SelectViewportContextValue {
	contentWrapper?: HTMLElement | null;
	shouldExpandOnScrollRef?: { current: boolean };
	onScrollButtonChange?: (node: HTMLElement | null) => void;
}

const [SelectViewportProvider, useSelectViewportContext] =
	createSelectContext<SelectViewportContextValue>(CONTENT_NAME, {});

const VIEWPORT_NAME = 'SelectViewport';

export function Viewport(props: any): any {
	const slot = S('Select.Viewport');
	const { __scopeSelect, nonce, ref: forwardedRef, onScroll, ...viewportProps } = props ?? {};
	const contentContext = useSelectContentContext(VIEWPORT_NAME, __scopeSelect);
	const viewportContext = useSelectViewportContext(VIEWPORT_NAME, __scopeSelect);
	const composedRefs = useComposedRefs(
		forwardedRef,
		contentContext.onViewportChange,
		subSlot(slot, 'refs'),
	);
	const prevScrollTopRef = useRef(0, subSlot(slot, 'prevScroll'));

	const handleScroll = composeEventHandlers(onScroll, (event: Event) => {
		const viewport = event.currentTarget as HTMLElement;
		const { contentWrapper, shouldExpandOnScrollRef } = viewportContext;
		if (shouldExpandOnScrollRef?.current && contentWrapper) {
			const scrolledBy = Math.abs(prevScrollTopRef.current - viewport.scrollTop);
			if (scrolledBy > 0) {
				const availableHeight = window.innerHeight - CONTENT_MARGIN * 2;
				const cssMinHeight = parseFloat(contentWrapper.style.minHeight);
				const cssHeight = parseFloat(contentWrapper.style.height);
				const prevHeight = Math.max(cssMinHeight, cssHeight);

				if (prevHeight < availableHeight) {
					const nextHeight = prevHeight + scrolledBy;
					const clampedNextHeight = Math.min(availableHeight, nextHeight);
					const heightDiff = nextHeight - clampedNextHeight;

					contentWrapper.style.height = clampedNextHeight + 'px';
					if (contentWrapper.style.bottom === '0px') {
						viewport.scrollTop = heightDiff > 0 ? heightDiff : 0;
						// ensure the content stays pinned to the bottom
						contentWrapper.style.justifyContent = 'flex-end';
					}
				}
			}
		}
		prevScrollTopRef.current = viewport.scrollTop;
	});
	return [
		// Hide scrollbars cross-browser and enable momentum scroll for touch devices
		createElement('style', {
			key: 'style',
			dangerouslySetInnerHTML: {
				__html: `[data-radix-select-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-select-viewport]::-webkit-scrollbar{display:none}`,
			},
			nonce,
		}),
		createElement(Collection.Slot, {
			key: 'slot',
			scope: __scopeSelect,
			children: createElement(Primitive.div, {
				'data-radix-select-viewport': '',
				role: 'presentation',
				...viewportProps,
				ref: composedRefs,
				onScroll: handleScroll,
				style: {
					// we use position: 'relative' here on the `viewport` so that when we call
					// `selectedItem.offsetTop` in calculations, the offset is relative to the viewport
					// (independent of the scrollUpButton).
					position: 'relative',
					flex: 1,
					// Viewport should only be scrollable in the vertical direction.
					// This won't work in vertical writing modes, so we'll need to
					// revisit this if/when that is supported
					// https://developer.chrome.com/blog/vertical-form-controls
					overflow: 'hidden auto',
					...viewportProps.style,
				},
			}),
		}),
	];
}

/* -------------------------------------------------------------------------------------------------
 * SelectGroup
 * -----------------------------------------------------------------------------------------------*/

const GROUP_NAME = 'SelectGroup';

interface SelectGroupContextValue {
	id: string;
}

const [SelectGroupContextProvider, useSelectGroupContext] =
	createSelectContext<SelectGroupContextValue>(GROUP_NAME);

export function Group(props: any): any {
	const slot = S('Select.Group');
	const { __scopeSelect, ...groupProps } = props ?? {};
	const groupId = useId(subSlot(slot, 'id'));
	return createElement(SelectGroupContextProvider, {
		scope: __scopeSelect,
		id: groupId,
		children: createElement(Primitive.div, {
			role: 'group',
			'aria-labelledby': groupId,
			...groupProps,
		}),
	});
}

/* -------------------------------------------------------------------------------------------------
 * SelectLabel
 * -----------------------------------------------------------------------------------------------*/

const LABEL_NAME = 'SelectLabel';

export function Label(props: any): any {
	const { __scopeSelect, ...labelProps } = props ?? {};
	const groupContext = useSelectGroupContext(LABEL_NAME, __scopeSelect);
	return createElement(Primitive.div, { id: groupContext.id, ...labelProps });
}

/* -------------------------------------------------------------------------------------------------
 * SelectItem
 * -----------------------------------------------------------------------------------------------*/

const ITEM_NAME = 'SelectItem';

interface SelectItemContextValue {
	value: string;
	disabled: boolean;
	textId: string;
	isSelected: boolean;
	onItemTextChange(node: HTMLElement | null): void;
}

const [SelectItemContextProvider, useSelectItemContext] =
	createSelectContext<SelectItemContextValue>(ITEM_NAME);

export function Item(props: any): any {
	const slot = S('Select.Item');
	const {
		__scopeSelect,
		value,
		disabled = false,
		textValue: textValueProp,
		ref: forwardedRef,
		...itemProps
	} = props ?? {};
	const context = useSelectContext(ITEM_NAME, __scopeSelect);
	const contentContext = useSelectContentContext(ITEM_NAME, __scopeSelect);
	const isSelected = context.value === value;
	const [textValue, setTextValue] = useState(textValueProp ?? '', subSlot(slot, 'textValue'));
	const [isFocused, setIsFocused] = useState(false, subSlot(slot, 'focused'));
	const handleItemRefCallback = useCallbackRef(
		(node: HTMLElement | null) => contentContext.itemRefCallback?.(node, value, disabled),
		subSlot(slot, 'refCb'),
	);
	const composedRefs = useComposedRefs(forwardedRef, handleItemRefCallback, subSlot(slot, 'refs'));
	const textId = useId(subSlot(slot, 'textId'));
	const pointerTypeRef = useRef<string>('touch', subSlot(slot, 'pointerType'));

	const handleSelect = (): void => {
		if (!disabled) {
			context.onValueChange(value);
			context.onOpenChange(false);
		}
	};

	return createElement(SelectItemContextProvider, {
		scope: __scopeSelect,
		value,
		disabled,
		textId,
		isSelected,
		onItemTextChange: useCallback(
			(node: HTMLElement | null) => {
				setTextValue((prevTextValue: string) => prevTextValue || (node?.textContent ?? '').trim());
			},
			[],
			subSlot(slot, 'textChange'),
		),
		children: createElement(Collection.ItemSlot, {
			scope: __scopeSelect,
			value,
			disabled,
			textValue,
			children: createElement(Primitive.div, {
				role: 'option',
				'aria-labelledby': textId,
				'data-highlighted': isFocused ? '' : undefined,
				// `isFocused` caveat fixes stuttering in VoiceOver
				'aria-selected': isSelected && isFocused,
				'data-state': isSelected ? 'checked' : 'unchecked',
				'aria-disabled': disabled || undefined,
				'data-disabled': disabled ? '' : undefined,
				tabIndex: disabled ? undefined : -1,
				...itemProps,
				ref: composedRefs,
				onFocus: composeEventHandlers(itemProps.onFocus, () => setIsFocused(true)),
				onBlur: composeEventHandlers(itemProps.onBlur, () => setIsFocused(false)),
				onClick: composeEventHandlers(itemProps.onClick, () => {
					// Open on click when using a touch or pen device
					if (pointerTypeRef.current !== 'mouse') handleSelect();
				}),
				onPointerUp: composeEventHandlers(itemProps.onPointerUp, () => {
					// Using a mouse you should be able to do pointer down, move through
					// the list, and release the pointer over the item to select it.
					if (pointerTypeRef.current === 'mouse') handleSelect();
				}),
				onPointerDown: composeEventHandlers(itemProps.onPointerDown, (event: PointerEvent) => {
					pointerTypeRef.current = event.pointerType;
				}),
				onPointerMove: composeEventHandlers(itemProps.onPointerMove, (event: PointerEvent) => {
					// Remember pointer type when sliding over to this item from another one
					pointerTypeRef.current = event.pointerType;
					if (disabled) {
						contentContext.onItemLeave?.();
					} else if (pointerTypeRef.current === 'mouse') {
						// even though safari doesn't support this option, it's acceptable
						// as it only means it might scroll a few pixels when using the pointer.
						(event.currentTarget as HTMLElement).focus({ preventScroll: true } as FocusOptions);
					}
				}),
				onPointerLeave: composeEventHandlers(itemProps.onPointerLeave, (event: PointerEvent) => {
					if (event.currentTarget === document.activeElement) {
						contentContext.onItemLeave?.();
					}
				}),
				onKeyDown: composeEventHandlers(itemProps.onKeyDown, (event: KeyboardEvent) => {
					const isTypingAhead = contentContext.searchRef?.current !== '';
					if (isTypingAhead && event.key === ' ') return;
					if (SELECTION_KEYS.includes(event.key)) handleSelect();
					// prevent page scroll if using the space key to select an item
					if (event.key === ' ') event.preventDefault();
				}),
			}),
		}),
	});
}

/* -------------------------------------------------------------------------------------------------
 * SelectItemText
 * -----------------------------------------------------------------------------------------------*/

const ITEM_TEXT_NAME = 'SelectItemText';

export function ItemText(props: any): any {
	const slot = S('Select.ItemText');
	// We ignore `className` and `style` as this part shouldn't be styled.
	const { __scopeSelect, className, style, ref: forwardedRef, ...itemTextProps } = props ?? {};
	void className;
	void style;
	const context = useSelectContext(ITEM_TEXT_NAME, __scopeSelect);
	const contentContext = useSelectContentContext(ITEM_TEXT_NAME, __scopeSelect);
	const itemContext = useSelectItemContext(ITEM_TEXT_NAME, __scopeSelect);
	const nativeOptionsContext = useSelectNativeOptionsContext(ITEM_TEXT_NAME, __scopeSelect);
	const [itemTextNode, setItemTextNode] = useState<HTMLElement | null>(null, subSlot(slot, 'node'));
	const handleItemTextRefCallback = useCallbackRef(
		(node: HTMLElement | null) =>
			contentContext.itemTextRefCallback?.(node, itemContext.value, itemContext.disabled),
		subSlot(slot, 'textRefCb'),
	);
	const composedRefs = useComposedRefs(
		forwardedRef,
		setItemTextNode,
		itemContext.onItemTextChange,
		handleItemTextRefCallback,
		subSlot(slot, 'refs'),
	);

	const textContent = itemTextNode?.textContent;
	const nativeOption = useMemo(
		() =>
			createElement('option', {
				key: itemContext.value,
				value: itemContext.value,
				disabled: itemContext.disabled,
				children: textContent,
			}),
		[itemContext.disabled, itemContext.value, textContent],
		subSlot(slot, 'option'),
	);

	const { onNativeOptionAdd, onNativeOptionRemove } = nativeOptionsContext;
	useLayoutEffect(
		() => {
			onNativeOptionAdd(nativeOption);
			return () => onNativeOptionRemove(nativeOption);
		},
		[onNativeOptionAdd, onNativeOptionRemove, nativeOption],
		subSlot(slot, 'e:option'),
	);

	return [
		createElement(Primitive.span, {
			key: 'text',
			id: itemContext.textId,
			...itemTextProps,
			ref: composedRefs,
		}),

		// Portal the select item text into the trigger value node.
		// When the value is empty we show the placeholder instead, so a
		// selected "clear" item (empty value) must not portal its text.
		// Keyed passthrough wrapper: a bare portal/null entry has no `key`, which
		// would trip octane's one-time missing-key warning for array children.
		createElement(ValueFragment, {
			key: 'portal',
			children:
				itemContext.isSelected &&
				context.valueNode &&
				!context.valueNodeHasChildren &&
				!shouldShowPlaceholder(context.value)
					? createPortal(itemTextProps.children, context.valueNode)
					: null,
		}),
	];
}

/* -------------------------------------------------------------------------------------------------
 * SelectItemIndicator
 * -----------------------------------------------------------------------------------------------*/

const ITEM_INDICATOR_NAME = 'SelectItemIndicator';

export function ItemIndicator(props: any): any {
	const { __scopeSelect, ...itemIndicatorProps } = props ?? {};
	const itemContext = useSelectItemContext(ITEM_INDICATOR_NAME, __scopeSelect);
	return itemContext.isSelected
		? createElement(Primitive.span, { 'aria-hidden': true, ...itemIndicatorProps })
		: null;
}

/* -------------------------------------------------------------------------------------------------
 * SelectScrollUpButton
 * -----------------------------------------------------------------------------------------------*/

const SCROLL_UP_BUTTON_NAME = 'SelectScrollUpButton';

export function ScrollUpButton(props: any): any {
	const slot = S('Select.ScrollUpButton');
	const contentContext = useSelectContentContext(SCROLL_UP_BUTTON_NAME, props?.__scopeSelect);
	const viewportContext = useSelectViewportContext(SCROLL_UP_BUTTON_NAME, props?.__scopeSelect);
	const [canScrollUp, setCanScrollUp] = useState(false, subSlot(slot, 'canScroll'));
	const composedRefs = useComposedRefs(
		props?.ref,
		viewportContext.onScrollButtonChange,
		subSlot(slot, 'refs'),
	);

	useLayoutEffect(
		() => {
			if (contentContext.viewport && contentContext.isPositioned) {
				const viewport = contentContext.viewport;
				function handleScroll(): void {
					const canScrollUp = viewport!.scrollTop > 0;
					setCanScrollUp(canScrollUp);
				}
				handleScroll();
				viewport.addEventListener('scroll', handleScroll);
				return () => viewport.removeEventListener('scroll', handleScroll);
			}
		},
		[contentContext.viewport, contentContext.isPositioned],
		subSlot(slot, 'e:scroll'),
	);

	return canScrollUp
		? createElement(ScrollButtonImpl, {
				...props,
				ref: composedRefs,
				onAutoScroll: () => {
					const { viewport, selectedItem } = contentContext;
					if (viewport && selectedItem) {
						viewport.scrollTop = viewport.scrollTop - selectedItem.offsetHeight;
					}
				},
			})
		: null;
}

/* -------------------------------------------------------------------------------------------------
 * SelectScrollDownButton
 * -----------------------------------------------------------------------------------------------*/

const SCROLL_DOWN_BUTTON_NAME = 'SelectScrollDownButton';

export function ScrollDownButton(props: any): any {
	const slot = S('Select.ScrollDownButton');
	const contentContext = useSelectContentContext(SCROLL_DOWN_BUTTON_NAME, props?.__scopeSelect);
	const viewportContext = useSelectViewportContext(SCROLL_DOWN_BUTTON_NAME, props?.__scopeSelect);
	const [canScrollDown, setCanScrollDown] = useState(false, subSlot(slot, 'canScroll'));
	const composedRefs = useComposedRefs(
		props?.ref,
		viewportContext.onScrollButtonChange,
		subSlot(slot, 'refs'),
	);

	useLayoutEffect(
		() => {
			if (contentContext.viewport && contentContext.isPositioned) {
				const viewport = contentContext.viewport;
				function handleScroll(): void {
					const maxScroll = viewport!.scrollHeight - viewport!.clientHeight;
					// we use Math.ceil here because if the UI is zoomed-in
					// `scrollTop` is not always reported as an integer
					const canScrollDown = Math.ceil(viewport!.scrollTop) < maxScroll;
					setCanScrollDown(canScrollDown);
				}
				handleScroll();
				viewport.addEventListener('scroll', handleScroll);
				return () => viewport.removeEventListener('scroll', handleScroll);
			}
		},
		[contentContext.viewport, contentContext.isPositioned],
		subSlot(slot, 'e:scroll'),
	);

	return canScrollDown
		? createElement(ScrollButtonImpl, {
				...props,
				ref: composedRefs,
				onAutoScroll: () => {
					const { viewport, selectedItem } = contentContext;
					if (viewport && selectedItem) {
						viewport.scrollTop = viewport.scrollTop + selectedItem.offsetHeight;
					}
				},
			})
		: null;
}

function ScrollButtonImpl(props: any): any {
	const slot = S('Select.ScrollButtonImpl');
	const { __scopeSelect, onAutoScroll, ref: forwardedRef, ...scrollIndicatorProps } = props ?? {};
	const contentContext = useSelectContentContext('SelectScrollButton', __scopeSelect);
	const autoScrollTimerRef = useRef<number | null>(null, subSlot(slot, 'timer'));
	const getItems = useCollection(__scopeSelect, subSlot(slot, 'items'));

	const clearAutoScrollTimer = useCallback(
		() => {
			if (autoScrollTimerRef.current !== null) {
				window.clearInterval(autoScrollTimerRef.current);
				autoScrollTimerRef.current = null;
			}
		},
		[],
		subSlot(slot, 'clear'),
	);

	useEffect(
		() => {
			return () => clearAutoScrollTimer();
		},
		[clearAutoScrollTimer],
		subSlot(slot, 'e:clear'),
	);

	// When the viewport becomes scrollable on either side, the relevant scroll button will mount.
	// Because it is part of the normal flow, it will push down (top button) or shrink (bottom button)
	// the viewport, potentially causing the active item to now be partially out of view.
	// We re-run the `scrollIntoView` logic to make sure it stays within the viewport.
	useLayoutEffect(
		() => {
			const activeItem = getItems().find(
				(item: any) => item.ref.current === document.activeElement,
			);
			// (guarded: jsdom lacks scrollIntoView)
			(activeItem?.ref.current as HTMLElement | undefined)?.scrollIntoView?.({ block: 'nearest' });
		},
		[getItems],
		subSlot(slot, 'e:intoView'),
	);

	return createElement(Primitive.div, {
		'aria-hidden': true,
		...scrollIndicatorProps,
		ref: forwardedRef,
		style: { flexShrink: 0, ...scrollIndicatorProps.style },
		onPointerDown: composeEventHandlers(scrollIndicatorProps.onPointerDown, () => {
			if (autoScrollTimerRef.current === null) {
				autoScrollTimerRef.current = window.setInterval(onAutoScroll, 50);
			}
		}),
		onPointerMove: composeEventHandlers(scrollIndicatorProps.onPointerMove, () => {
			contentContext.onItemLeave?.();
			if (autoScrollTimerRef.current === null) {
				autoScrollTimerRef.current = window.setInterval(onAutoScroll, 50);
			}
		}),
		onPointerLeave: composeEventHandlers(scrollIndicatorProps.onPointerLeave, () => {
			clearAutoScrollTimer();
		}),
	});
}

/* -------------------------------------------------------------------------------------------------
 * SelectSeparator
 * -----------------------------------------------------------------------------------------------*/

export function Separator(props: any): any {
	const { __scopeSelect, ...separatorProps } = props ?? {};
	return createElement(Primitive.div, { 'aria-hidden': true, ...separatorProps });
}

/* -------------------------------------------------------------------------------------------------
 * SelectArrow
 * -----------------------------------------------------------------------------------------------*/

const ARROW_NAME = 'SelectArrow';

export function Arrow(props: any): any {
	const slot = S('Select.Arrow');
	const { __scopeSelect, ...arrowProps } = props ?? {};
	const popperScope = usePopperScope(__scopeSelect, subSlot(slot, 'popper'));
	const contentContext = useSelectContentContext(ARROW_NAME, __scopeSelect);
	return contentContext.position === 'popper'
		? createElement(PopperPrimitive.Arrow, { ...popperScope, ...arrowProps })
		: null;
}

/* -------------------------------------------------------------------------------------------------
 * SelectBubbleInput
 * -----------------------------------------------------------------------------------------------*/

const BUBBLE_INPUT_NAME = 'SelectBubbleInput';

export function BubbleInput(props: any): any {
	const slot = S('Select.BubbleInput');
	const { __scopeSelect, ref: forwardedRef, ...selectProps } = props ?? {};
	const context = useSelectContext(BUBBLE_INPUT_NAME, __scopeSelect);
	const { value, onValueChange, required, disabled, name, autoComplete, form } = context;
	const { nativeOptions } = context;
	const ref = useRef<HTMLSelectElement | null>(null, subSlot(slot, 'ref'));
	const composedRefs = useComposedRefs(forwardedRef, ref, subSlot(slot, 'refs'));
	const selectValue = value ?? '';
	const prevValue = usePrevious(selectValue, subSlot(slot, 'prev'));

	// A consumer may render a `Select.Item` with an empty value to act as a
	// "clear" option. In that case it already provides a native `<option>` with
	// an empty value, so we avoid rendering our synthetic placeholder option to
	// prevent duplicate empty options in the native `select`.
	const hasEmptyValueOption = Array.from(nativeOptions).some(
		(option: any) => (option?.props?.value ?? '') === '',
	);

	// Bubble value change to parents (e.g form change event). The controlled
	// `value` prop below keeps the select's DOM selection in sync (octane
	// re-projects it at every commit, covering mount + late option registration
	// — the source's `key={nativeSelectKey}` rebuild), so this effect only
	// dispatches the event.
	useEffect(
		() => {
			const select = ref.current;
			if (!select) return;

			if (prevValue !== selectValue) {
				select.dispatchEvent(new Event('change', { bubbles: true }));
			}
		},
		[prevValue, selectValue],
		subSlot(slot, 'e:bubble'),
	);

	/**
	 * We purposefully use a `select` here to support form autofill as much as
	 * possible.
	 *
	 * The `value` is live CONTROLLED (octane React-parity): the runtime projects
	 * it onto the options at every commit and restores it after event flushes;
	 * value changes still bubble to any parent form `onChange` via the `change`
	 * event dispatched above.
	 *
	 * We use visually hidden styles rather than `display: "none"` because
	 * Safari autofill won't work otherwise.
	 */
	return createElement(Primitive.select, {
		'aria-hidden': true,
		required,
		tabIndex: -1,
		name,
		autoComplete,
		disabled,
		form,
		value: selectValue,
		// React's synthetic onChange on a `<select>` is the native `change` event.
		onChange: (event: Event) => onValueChange((event.target as HTMLSelectElement).value),
		...selectProps,
		style: { ...VISUALLY_HIDDEN_STYLES, ...selectProps.style },
		ref: composedRefs,
		// All entries keyed, no null holes (a null entry would trip octane's one-time
		// missing-key warning for array children): the placeholder option is simply
		// omitted when not needed.
		children: [
			...(shouldShowPlaceholder(value) && !hasEmptyValueOption
				? [createElement('option', { key: '__placeholder', value: '' })]
				: []),
			...Array.from(nativeOptions),
		],
	});
}

/* -----------------------------------------------------------------------------------------------*/

function isFunction(value: unknown): value is (...args: any[]) => any {
	return typeof value === 'function';
}

function shouldShowPlaceholder(value?: string): boolean {
	return value === '' || value === undefined;
}

// @radix-ui/number's clamp, inlined.
function clamp(value: number, [min, max]: [number, number]): number {
	return Math.min(max, Math.max(min, value));
}

function useTypeaheadSearch(
	...args: any[]
): [{ current: string }, (key: string) => void, () => void] {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('Select.useTypeaheadSearch');
	const onSearchChange = user[0] as (search: string) => void;
	const handleSearchChange = useCallbackRef(onSearchChange, subSlot(slot, 'change'));
	const searchRef = useRef('', subSlot(slot, 'search'));
	const timerRef = useRef(0, subSlot(slot, 'timer'));

	const handleTypeaheadSearch = useCallback(
		(key: string) => {
			const search = searchRef.current + key;
			handleSearchChange(search);

			(function updateSearch(value: string) {
				searchRef.current = value;
				window.clearTimeout(timerRef.current);
				// Reset `searchRef` 1 second after it was last updated
				if (value !== '') timerRef.current = window.setTimeout(() => updateSearch(''), 1000);
			})(search);
		},
		[handleSearchChange],
		subSlot(slot, 'handle'),
	);

	const resetTypeahead = useCallback(
		() => {
			searchRef.current = '';
			window.clearTimeout(timerRef.current);
		},
		[],
		subSlot(slot, 'reset'),
	);

	useEffect(
		() => {
			return () => window.clearTimeout(timerRef.current);
		},
		[],
		subSlot(slot, 'e:timer'),
	);

	return [searchRef, handleTypeaheadSearch, resetTypeahead];
}

/**
 * This is the "meat" of the typeahead matching logic. It takes in a list of items,
 * the search and the current item, and returns the next item (or `undefined`).
 *
 * We normalize the search because if a user has repeatedly pressed a character,
 * we want the exact same behavior as if we only had that one character
 * (ie. cycle through items starting with that character)
 *
 * We also reorder the items by wrapping the array around the current item.
 * This is so we always look forward from the current item, and picking the first
 * item will always be the correct one.
 *
 * Finally, if the normalized search is exactly one character, we exclude the
 * current item from the values because otherwise it would be the first to match always
 * and focus would never move. This is as opposed to the regular case, where we
 * don't want focus to move if the current item still matches.
 */
function findNextItem<T extends { textValue: string }>(
	items: T[],
	search: string,
	currentItem?: T,
): T | undefined {
	const isRepeated = search.length > 1 && Array.from(search).every((char) => char === search[0]);
	const normalizedSearch = isRepeated ? search[0]! : search;
	const currentItemIndex = currentItem ? items.indexOf(currentItem) : -1;
	let wrappedItems = wrapArray(items, Math.max(currentItemIndex, 0));
	const excludeCurrentItem = normalizedSearch.length === 1;
	if (excludeCurrentItem) wrappedItems = wrappedItems.filter((v) => v !== currentItem);
	const nextItem = wrappedItems.find((item) =>
		item.textValue.toLowerCase().startsWith(normalizedSearch.toLowerCase()),
	);
	return nextItem !== currentItem ? nextItem : undefined;
}

/**
 * Wraps an array around itself at a given start index
 * Example: `wrapArray(['a', 'b', 'c', 'd'], 2) === ['c', 'd', 'a', 'b']`
 */
function wrapArray<T>(array: T[], startIndex: number): T[] {
	return array.map<T>((_, index) => array[(startIndex + index) % array.length]!);
}

export {
	Root as Select,
	Provider as SelectProvider,
	Trigger as SelectTrigger,
	Value as SelectValue,
	Icon as SelectIcon,
	Portal as SelectPortal,
	Content as SelectContent,
	Viewport as SelectViewport,
	Group as SelectGroup,
	Label as SelectLabel,
	Item as SelectItem,
	ItemText as SelectItemText,
	ItemIndicator as SelectItemIndicator,
	ScrollUpButton as SelectScrollUpButton,
	ScrollDownButton as SelectScrollDownButton,
	Separator as SelectSeparator,
	Arrow as SelectArrow,
	BubbleInput as SelectBubbleInput,
};
