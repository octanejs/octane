import { Children, isChildrenBlock } from 'octane';

/**
 * Upstream `Marker` asks whether it was given any children with
 *
 *     React.Children.forEach(props.children, el => { if (el) hasChildren = true })
 *
 * and uses the answer to choose between Mapbox's own default pin and a
 * binding-created element it portals custom content into.
 *
 * Octane's compiler lowers a `.tsrx` parent's element children to a
 * children-block render function rather than a descriptor array, so
 * `Children.forEach` alone cannot see them. A `.tsx` parent still produces
 * descriptors. Both dialects reach this binding, so both are handled here.
 *
 * There is no upstream module at this path. It is a port-owned addition.
 */
export function hasRenderableChildren(children: unknown): boolean {
	if (children == null) return false;
	if (isChildrenBlock(children)) return true;
	let found = false;
	Children.forEach(children, (child) => {
		if (child) found = true;
	});
	return found;
}
