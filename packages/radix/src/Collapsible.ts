// Ported from @radix-ui/react-collapsible. An open/closed disclosure: Root owns the
// controllable `open` state + shares it via context; Trigger toggles it + carries ARIA;
// Content stays mounted through its exit animation via `Presence` and exposes the
// `--radix-collapsible-content-height/-width` CSS vars for animating. `.ts` components via
// createElement; ref-as-prop.
import { createElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'octane';

import { composeEventHandlers } from './compose-event-handlers';
import { useComposedRefs } from './compose-refs';
import { createContextScope } from './context';
import { S, subSlot } from './internal';
import { Presence } from './Presence';
import { Primitive } from './Primitive';
import { useControllableState } from './useControllableState';
import { useId } from './useId';

interface CollapsibleContextValue {
	contentId: string;
	disabled?: boolean;
	open: boolean;
	onOpenToggle: () => void;
}

// Scoped context — `createCollapsibleScope` lets a composing primitive (Accordion) thread
// its own Collapsible scope so the two don't collide.
export const [createCollapsibleContext, createCollapsibleScope] = createContextScope('Collapsible');
const [CollapsibleProvider, useCollapsibleContext] =
	createCollapsibleContext<CollapsibleContextValue>('Collapsible');

function getState(open?: boolean): 'open' | 'closed' {
	return open ? 'open' : 'closed';
}

export function Root(props: any): any {
	const slot = S('Collapsible.Root');
	const {
		__scopeCollapsible,
		open: openProp,
		defaultOpen,
		disabled,
		onOpenChange,
		...rest
	} = props ?? {};

	const [open, setOpen] = useControllableState<boolean>(
		{ prop: openProp, defaultProp: defaultOpen ?? false, onChange: onOpenChange },
		subSlot(slot, 'open'),
	);
	const contentId = useId(subSlot(slot, 'id'));
	const onOpenToggle = useCallback(
		() => setOpen((prev) => !prev),
		[setOpen],
		subSlot(slot, 'toggle'),
	);

	return createElement(CollapsibleProvider, {
		scope: __scopeCollapsible,
		contentId,
		disabled,
		open,
		onOpenToggle,
		children: createElement(Primitive.div, {
			'data-state': getState(open),
			'data-disabled': disabled ? '' : undefined,
			...rest,
		}),
	});
}

export function Trigger(props: any): any {
	const { __scopeCollapsible, ...rest } = props ?? {};
	const context = useCollapsibleContext('CollapsibleTrigger', __scopeCollapsible);
	return createElement(Primitive.button, {
		type: 'button',
		// Radix parity: only reference the content while it's expanded.
		'aria-controls': context.open ? context.contentId : undefined,
		'aria-expanded': context.open || false,
		'data-state': getState(context.open),
		'data-disabled': context.disabled ? '' : undefined,
		disabled: context.disabled,
		...rest,
		onClick: composeEventHandlers(rest.onClick, context.onOpenToggle),
	});
}

export function Content(props: any): any {
	const { __scopeCollapsible, forceMount, ...contentProps } = props ?? {};
	const context = useCollapsibleContext('CollapsibleContent', __scopeCollapsible);
	return createElement(Presence, {
		present: forceMount || context.open,
		children: ({ present }: { present: boolean }) =>
			createElement(ContentImpl, { ...contentProps, __scopeCollapsible, present }),
	});
}

function ContentImpl(props: any): any {
	const slot = S('Collapsible.ContentImpl');
	const {
		__scopeCollapsible,
		present,
		children,
		ref: forwardedRef,
		style,
		...contentProps
	} = props;
	const context = useCollapsibleContext('CollapsibleContent', __scopeCollapsible);

	const [isPresent, setIsPresent] = useState<boolean>(present, subSlot(slot, 'present'));
	const rRef = useRef<HTMLElement | null>(null, subSlot(slot, 'ref'));
	const composedRefs = useComposedRefs(forwardedRef, rRef, subSlot(slot, 'refs'));
	const heightRef = useRef(0, subSlot(slot, 'h'));
	const widthRef = useRef(0, subSlot(slot, 'w'));
	const isOpen = context.open || isPresent;
	const isMountAnimationPreventedRef = useRef(isOpen, subSlot(slot, 'prevent'));
	const originalStylesRef = useRef<any>(undefined, subSlot(slot, 'orig'));

	useEffect(
		() => {
			const raf = requestAnimationFrame(() => (isMountAnimationPreventedRef.current = false));
			return () => cancelAnimationFrame(raf);
		},
		[],
		subSlot(slot, 'e:mount'),
	);

	useLayoutEffect(
		() => {
			const node = rRef.current;
			if (node) {
				originalStylesRef.current = originalStylesRef.current || {
					transitionDuration: node.style.transitionDuration,
					animationName: node.style.animationName,
				};
				// Block the animation while measuring the natural size.
				node.style.transitionDuration = '0s';
				node.style.animationName = 'none';
				const rect = node.getBoundingClientRect();
				heightRef.current = rect.height;
				widthRef.current = rect.width;
				if (!isMountAnimationPreventedRef.current) {
					node.style.transitionDuration = originalStylesRef.current.transitionDuration;
					node.style.animationName = originalStylesRef.current.animationName;
				}
				setIsPresent(present);
			}
		},
		[context.open, present],
		subSlot(slot, 'e:measure'),
	);

	const height = heightRef.current;
	const width = widthRef.current;
	return createElement(Primitive.div, {
		'data-state': getState(context.open),
		'data-disabled': context.disabled ? '' : undefined,
		id: context.contentId,
		hidden: !isOpen,
		...contentProps,
		ref: composedRefs,
		style: {
			'--radix-collapsible-content-height': height ? `${height}px` : undefined,
			'--radix-collapsible-content-width': width ? `${width}px` : undefined,
			...style,
		},
		children: isOpen ? children : null,
	});
}

export { Root as Collapsible };
export { useCollapsibleContext };
