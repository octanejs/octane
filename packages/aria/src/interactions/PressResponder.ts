// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/interactions/PressResponder.tsx).
// octane adaptations:
// - React.forwardRef → octane ref-as-prop (the forwarded ref arrives as `props.ref`);
//   JSX → createElement (this is a plain-`.ts` component, so no compiled slots — hooks use
//   the stable S()/subSlot component-slot convention).
// - React's ReactNode/JSX.Element types → `any` (octane descriptors).
// - The dev-only "PressResponder was rendered without a pressable child" console.warn
//   effect is not ported (repo policy: no dev-only console warnings); `register()`
//   bookkeeping is unchanged.
import type { FocusableElement } from '@react-types/shared';
import { createElement, useContext, useMemo, useRef } from 'octane';

import { mergeProps } from '../utils/mergeProps';
import type { PressProps } from './usePress';
import { PressResponderContext } from './context';
import { S, subSlot } from '../internal';
import { useObjectRef } from '../utils/useObjectRef';
import { useSyncRef } from '../utils/useSyncRef';

// octane adaptation: ref-as-prop replaces React's ForwardedRef parameter.
type ForwardedRef<T> = ((instance: T | null) => (() => void) | void) | { current: T | null } | null;

interface PressResponderProps extends PressProps {
	children: any;
	ref?: ForwardedRef<FocusableElement>;
}

export function PressResponder(allProps: PressResponderProps): any {
	const slot = S('PressResponder');
	let { children, ref, ...props } = allProps;

	let isRegistered = useRef(false, subSlot(slot, 'registered'));
	let prevContext = useContext(PressResponderContext);
	let context: any = mergeProps(prevContext || {}, {
		...props,
		register() {
			isRegistered.current = true;
			if (prevContext) {
				prevContext.register();
			}
		},
	});

	context.ref = useObjectRef(ref || prevContext?.ref, subSlot(slot, 'ref'));
	useSyncRef(prevContext, context.ref, subSlot(slot, 'sync'));

	return createElement(PressResponderContext.Provider, { value: context, children });
}

export function ClearPressResponder({ children }: { children: any }): any {
	const slot = S('ClearPressResponder');
	let context = useMemo(() => ({ register: () => {} }), [], subSlot(slot, 'context'));
	return createElement(PressResponderContext.Provider, { value: context as any, children });
}
