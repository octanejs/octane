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

	let targetChild = children;
	let projectedChildren: any[] | undefined;
	if (!isValidElement(children) || children.type === Slottable) {
		const content: any[] = [];
		// The callback sees the original children before map normalizes their keys.
		// Each marker contributes its inner children, and the last selects the target.
		const normalized = Children.map(children, (child) => {
			if (isSlottable(child)) {
				const element = child.props.children;
				if (Children.count(element) > 1) Children.only(null);
				targetChild = isValidElement(element) ? element : null;
				projectedChildren = content;
				content.push(targetChild?.props.children);
			} else {
				content.push(child);
			}
			return child;
		});
		// Octane also accepts a one-element array of descriptors from .tsrx callers.
		if (!projectedChildren && Array.isArray(children) && normalized?.length === 1) {
			targetChild = normalized[0];
		}
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
		if (projectedChildren) merged.children = projectedChildren;
		return cloneElement(targetChild as any, merged);
	}
	// 0 children → nothing; >1 → Children.only throws (like Radix).
	return Children.count(targetChild) > 1 ? Children.only(targetChild) : null;
}
