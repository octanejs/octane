// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/interactions/useFocusable.tsx).
// octane adaptations:
// - React's `forwardRef` becomes octane's ref-as-prop: `FocusableProvider` and `Focusable`
//   read the forwarded ref from props.
// - Components are built with `createElement`; `Focusable` re-projects its child with
//   octane's `cloneElement`/`isValidElement`/`Children` (they operate on element
//   DESCRIPTORS — prop-position JSX / createElement results). Non-element children render
//   unchanged (upstream's dev-warning path, without the warning).
// - The composed child ref is memoized (upstream builds `mergeRefs(...)` fresh per render);
//   a fresh identity would make octane detach/re-attach the child's ref every render (see
//   the radix Slot note on ref churn).
// - Upstream's dev-only console warning effect (ref/focusable/ARIA-role checks) is not ported.
// - `FocusableProps` / `DOMAttributes` from '@react-types/shared' drag React event types;
//   local structural equivalents (built on the ported FocusEvents/KeyboardEvents) replace them.
import type { FocusableDOMProps, FocusableElement, RefObject } from '@react-types/shared';
import {
	Children,
	cloneElement,
	createContext,
	createElement,
	isValidElement,
	useContext,
	useEffect,
	useMemo,
	useRef,
} from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { focusSafely } from './focusSafely';
import { mergeProps } from '../utils/mergeProps';
import { mergeRefs, type MergableRef } from '../utils/mergeRefs';
import { useFocus, type FocusEvents } from './useFocus';
import { useKeyboard, type KeyboardEvents } from './useKeyboard';
import { useObjectRef } from '../utils/useObjectRef';
import { useSyncRef } from '../utils/useSyncRef';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React attribute types).
export type DOMAttributes = Record<string, any>;

// octane adaptation: local structural FocusableProps (upstream's is typed over React events).
export interface FocusableProps<Target = FocusableElement>
	extends FocusEvents<Target>, KeyboardEvents {
	/** Whether the element should receive focus on render. */
	autoFocus?: boolean;
}

type MutableRefObject<T> = { current: T };

export interface FocusableOptions<T = FocusableElement>
	extends FocusableProps<T>, FocusableDOMProps {
	/** Whether focus should be disabled. */
	isDisabled?: boolean;
}

export interface FocusableProviderProps extends DOMAttributes {
	/** The child element to provide DOM props to. */
	children?: any;
}

interface FocusableContextValue extends FocusableProviderProps {
	ref?: MutableRefObject<FocusableElement | null>;
}

// Exported for collections, which forwards this context.
/** @private */
export let FocusableContext = createContext<FocusableContextValue | null>(null);

function useFocusableContext(
	ref: RefObject<FocusableElement | null>,
	slot: symbol | undefined,
): FocusableContextValue {
	let context = useContext(FocusableContext) || {};
	useSyncRef(context, ref, subSlot(slot, 'sync'));

	let { ref: _, ...otherProps } = context;
	return otherProps;
}

/**
 * Provides DOM props to the nearest focusable child.
 */
export function FocusableProvider(
	props: FocusableProviderProps & { ref?: MergableRef<FocusableElement> },
): any {
	const slot = S('FocusableProvider');
	let { children, ref, ...otherProps } = props;
	let objRef = useObjectRef<FocusableElement>(ref, subSlot(slot, 'objRef'));
	let context = {
		...otherProps,
		ref: objRef,
	};

	return createElement(FocusableContext.Provider, { value: context, children });
}

export interface FocusableAria {
	/** Props for the focusable element. */
	focusableProps: DOMAttributes;
}

/**
 * Used to make an element focusable and capable of auto focus.
 */
export function useFocusable<T extends FocusableElement = FocusableElement>(
	props: FocusableOptions<T>,
	domRef: RefObject<FocusableElement | null>,
): FocusableAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useFocusable<T extends FocusableElement = FocusableElement>(
	props: FocusableOptions<T>,
	domRef: RefObject<FocusableElement | null>,
	slot: symbol | undefined,
): FocusableAria;
export function useFocusable(...args: any[]): FocusableAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useFocusable');
	const props = user[0] as FocusableOptions;
	const domRef = user[1] as RefObject<FocusableElement | null>;

	let { focusProps } = useFocus(props, subSlot(slot, 'focus'));
	let { keyboardProps } = useKeyboard(props, subSlot(slot, 'keyboard'));
	let interactions = mergeProps(focusProps, keyboardProps);
	let domProps = useFocusableContext(domRef, subSlot(slot, 'context'));
	let interactionProps = props.isDisabled ? {} : domProps;
	let autoFocusRef = useRef(props.autoFocus, subSlot(slot, 'autoFocus'));

	useEffect(
		() => {
			if (autoFocusRef.current && domRef.current) {
				focusSafely(domRef.current);
			}
			autoFocusRef.current = false;
		},
		[domRef],
		subSlot(slot, 'autoFocusEffect'),
	);

	// Always set a tabIndex so that Safari allows focusing native buttons and inputs.
	let tabIndex: number | undefined = props.excludeFromTabOrder ? -1 : 0;
	if (props.isDisabled) {
		tabIndex = undefined;
	}

	return {
		focusableProps: mergeProps(
			{
				...interactions,
				tabIndex,
			},
			interactionProps,
		),
	};
}

export interface FocusableComponentProps extends FocusableOptions {
	children: any;
}

export function Focusable(
	props: FocusableComponentProps & { ref?: MergableRef<FocusableElement> },
): any {
	const slot = S('Focusable');
	let { children, ref: forwardedRef, ...otherProps } = props;
	let ref = useObjectRef<FocusableElement>(forwardedRef, subSlot(slot, 'objRef'));
	let { focusableProps } = useFocusable(otherProps, ref, subSlot(slot, 'focusable'));

	// octane adaptation: upstream's dev-only console warning effect (Element ref /
	// isFocusable / interactive-ARIA-role checks) is not ported.

	// Resolve the single element child. octane children arrive as descriptors from
	// prop-position JSX / createElement; a single-element array unwraps (octane
	// convention — see radix Slot).
	let target: any = children;
	if (Array.isArray(children)) {
		const arr = Children.toArray(children);
		if (arr.length === 1) {
			target = arr[0];
		}
	}

	// octane adaptation: with a non-element child (e.g. text, or a compiled
	// children-position render function), render children unchanged — the octane
	// equivalent of upstream's warning path, without the warning.
	if (!isValidElement(target)) {
		return children;
	}

	let child: any = Children.only(target);

	// octane is ref-as-prop (React 19 shape), so the child's own ref lives on its props.
	let childRef = child.props?.ref;

	// octane adaptation: memoize the composed ref so its identity is stable across
	// renders (upstream rebuilds it every render; see the header note).
	let mergedRef = useMemo(
		() => mergeRefs(childRef, ref),
		[childRef, ref],
		subSlot(slot, 'mergedRef'),
	);

	return cloneElement(child, {
		...mergeProps(focusableProps, child.props ?? {}),
		ref: mergedRef,
	});
}
