// Ported from @radix-ui/react-slot. `Slot` merges its own props onto a single element
// child and renders that child in place — the engine behind `asChild`. React's
// `forwardRef` + `Children`/`cloneElement`/`composeRefs` map onto octane's ref-as-prop +
// the runtime's `Children`/`cloneElement`/`isValidElement`.
//
// IMPORTANT (octane): these operate on element DESCRIPTORS. In `.tsrx`, prop-position JSX
// (`el={<button/>}`), `createElement`, and `.map()` returns are descriptors, but
// children-position JSX compiles to a render function. So an octane `asChild` consumer
// passes the child element through a prop / value position rather than React's
// children-position `<Trigger asChild><button/></Trigger>` (see docs/radix-migration-plan.md).
import { Children, cloneElement, createElement, isValidElement, normalizeClass } from 'octane';

import { composeRefs } from './compose-refs';

/** A marker whose child element `Slot` projects while keeping its sibling children. */
export function Slottable(props: { children?: any }): any {
	return props.children;
}

function isSlottable(child: any): boolean {
	return isValidElement(child) && child.type === Slottable;
}

// slotProps (the behavior) merged UNDER childProps (the user's element wins), except:
// event handlers chain (child first, then behavior), `style` merges (child wins per-key),
// and `class`/`className` compose clsx-style via octane's normalizeClass.
function mergeProps(slotProps: any, childProps: any): any {
	const overrideProps: any = { ...childProps };
	for (const propName in childProps) {
		const slotPropValue = slotProps[propName];
		const childPropValue = childProps[propName];
		const isHandler = /^on[A-Z]/.test(propName);
		if (isHandler) {
			if (slotPropValue && childPropValue) {
				overrideProps[propName] = (...args: any[]) => {
					const result = childPropValue(...args);
					slotPropValue(...args);
					return result;
				};
			} else if (slotPropValue) {
				overrideProps[propName] = slotPropValue;
			}
		} else if (propName === 'style') {
			overrideProps[propName] = { ...slotPropValue, ...childPropValue };
		} else if (propName === 'className' || propName === 'class') {
			overrideProps[propName] = normalizeClass([slotPropValue, childPropValue]);
		}
	}
	return { ...slotProps, ...overrideProps };
}

function SlotClone(props: any): any {
	const { children, ...slotProps } = props;
	if (isValidElement(children)) {
		const childProps: any = (children as any).props ?? {};
		const merged = mergeProps(slotProps, childProps);
		// Compose refs (octane ref-as-prop): the Slot's `ref` + the child's own `ref`.
		const slotRef = slotProps.ref;
		const childRef = childProps.ref;
		merged.ref = slotRef !== undefined ? composeRefs(slotRef, childRef) : childRef;
		return cloneElement(children as any, merged);
	}
	// 0 children → nothing; >1 → Children.only throws (like Radix).
	return Children.count(children) > 1 ? Children.only(children) : null;
}

export function Slot(props: any): any {
	const { children, ...slotProps } = props;
	const childrenArray = Children.toArray(children);
	const slottable = childrenArray.find(isSlottable);

	if (slottable) {
		// The element to render is the child of the <Slottable>; its siblings render around it.
		const newElement = (slottable as any).props.children;
		const newChildren = Children.map(children, (child: any) => {
			if (child === slottable) {
				if (Children.count(newElement) > 1) return Children.only(null as any);
				return isValidElement(newElement) ? (newElement as any).props.children : null;
			}
			return child;
		});
		return SlotClone({
			...slotProps,
			children: isValidElement(newElement)
				? cloneElement(newElement as any, undefined, newChildren)
				: null,
		});
	}

	return SlotClone({ ...slotProps, children });
}
