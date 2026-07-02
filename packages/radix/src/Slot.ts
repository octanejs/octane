// Ported from @radix-ui/react-slot (the MODERN version). `Slot` merges its own props onto
// a single element child and renders that child in place — the engine behind `asChild`.
// React's `forwardRef` + `Children`/`cloneElement` map onto octane's ref-as-prop + the
// runtime's `Children`/`cloneElement`/`isValidElement`.
//
// CRITICAL (learned the hard way, mirroring Radix's own history): the composed ref MUST be
// memoized (`useComposedRefs`), not built fresh per render — a fresh identity makes the
// renderer detach(null)+re-attach the child's ref every render, and refs that are state
// setters (DismissableLayer/FocusScope/Presence `setNode`) then re-render → fresh ref →
// an infinite loop. Radix's legacy inline `composeRefs` slot had this exact churn.
//
// IMPORTANT (octane): these operate on element DESCRIPTORS. In `.tsrx`, prop-position JSX
// (`el={<button/>}`), `createElement`, and `.map()` returns are descriptors, but
// children-position JSX compiles to a render function — so `asChild` consumers pass the
// child element through a prop / value position (see docs/radix-migration-plan.md).
import { Children, cloneElement, isValidElement, normalizeClass } from 'octane';

import { useComposedRefs } from './compose-refs';
import { S, subSlot } from './internal';

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

export function Slot(props: any): any {
	const slot = S('Slot');
	const { children, ...slotProps } = props ?? {};

	// Resolve the element to project onto. With a `<Slottable>` marker among the children,
	// its child is the projection target and the siblings become the new children.
	const childrenArray = Children.toArray(children);
	const slottable = childrenArray.find(isSlottable);
	let targetChild: any = children;
	// octane convention: children are often passed as an ARRAY prop (that's how a .tsrx
	// caller provides enumerable children — see Dialog.Portal). React's Children.only
	// rejects arrays outright; here a single-element array unwraps to its element.
	if (!slottable && Array.isArray(children) && childrenArray.length === 1) {
		targetChild = childrenArray[0];
	}
	let newChildren: any = null;
	let hasSlottable = false;
	if (slottable) {
		hasSlottable = true;
		const newElement = (slottable as any).props.children;
		newChildren = Children.map(children, (child: any) => {
			if (child === slottable) {
				if (Children.count(newElement) > 1) return Children.only(null as any);
				return isValidElement(newElement) ? (newElement as any).props.children : null;
			}
			return child;
		});
		targetChild = isValidElement(newElement)
			? cloneElement(newElement as any, undefined, newChildren)
			: null;
	}

	const childIsElement = isValidElement(targetChild);
	const childRef = childIsElement ? (targetChild as any).props?.ref : undefined;
	const slotRef = slotProps.ref;
	// MEMOIZED composed ref — see the header note. (octane allows conditional hooks, but
	// this one runs unconditionally anyway.)
	const composedRef = useComposedRefs(slotRef, childRef, subSlot(slot, 'refs'));

	if (childIsElement) {
		const merged = mergeProps(slotProps, (targetChild as any).props ?? {});
		merged.ref = slotRef !== undefined ? composedRef : childRef;
		if (hasSlottable) merged.children = newChildren;
		return cloneElement(targetChild as any, merged);
	}
	// 0 children → nothing; >1 → Children.only throws (like Radix).
	return Children.count(targetChild) > 1 ? Children.only(targetChild) : null;
}
