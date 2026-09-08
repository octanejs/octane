import type { ElementDescriptor, OctaneNode } from 'octane';
import { Children } from 'octane';

/** Returns whether the OctaneNode has props (and therefore is an `Element` versus primitive type) */
function isChildWithProps<P extends object>(child: OctaneNode): child is ElementDescriptor<P> {
	return !!child && typeof child === 'object' && 'props' in child && child.props != null;
}

/**
 * Returns children and grandchildren of type OctaneNode.
 * Flattens children one level to support Fragments and Array type children.
 */
export default function getChildrenAndGrandchildrenWithProps<P extends object>(
	children: OctaneNode,
): ElementDescriptor<P>[] {
	return Children.toArray(children)
		.flatMap((child) => {
			if (isChildWithProps(child) && (child.props as any).children) {
				return (child.props as any).children;
			}
			return child;
		})
		.filter((child) => isChildWithProps<P>(child)) as unknown as ElementDescriptor<P>[];
}
