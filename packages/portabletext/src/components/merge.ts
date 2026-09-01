import type { PortableTextComponents, PortableTextOctaneComponents } from '../types';

export function mergeComponents(
	parent: PortableTextOctaneComponents,
	overrides: PortableTextComponents,
): PortableTextOctaneComponents {
	const {
		block: _block,
		list: _list,
		listItem: _listItem,
		marks: _marks,
		types: _types,
		...rest
	} = overrides;
	return {
		...parent,
		block: mergeDeeply(parent, overrides, 'block') as PortableTextOctaneComponents['block'],
		list: mergeDeeply(parent, overrides, 'list') as PortableTextOctaneComponents['list'],
		listItem: mergeDeeply(
			parent,
			overrides,
			'listItem',
		) as PortableTextOctaneComponents['listItem'],
		marks: mergeDeeply(parent, overrides, 'marks') as PortableTextOctaneComponents['marks'],
		types: mergeDeeply(parent, overrides, 'types') as PortableTextOctaneComponents['types'],
		...rest,
	};
}

function mergeDeeply(
	parent: PortableTextOctaneComponents,
	overrides: PortableTextComponents,
	key: 'block' | 'list' | 'listItem' | 'marks' | 'types',
): PortableTextOctaneComponents[typeof key] {
	const override = overrides[key];
	const parentValue = parent[key];
	if (typeof override === 'function') return override;
	if (override && typeof parentValue === 'function') return override;
	if (override) {
		return { ...parentValue, ...override } as PortableTextOctaneComponents[typeof key];
	}
	return parentValue;
}
