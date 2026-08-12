import type { Nodes } from 'hast';
import { type Components as HastRuntimeComponents, toJsxRuntime } from 'hast-util-to-jsx-runtime';
import { createElement, type ElementDescriptor, Fragment } from 'octane';
import type { Components } from './types';

type RuntimeElementType = Parameters<typeof createElement>[0];
type RuntimeProps = Record<string, unknown> & { key?: string | number };

function jsx(
	type: RuntimeElementType,
	props: RuntimeProps,
	key?: string | number,
): ElementDescriptor {
	return createElement(type, key === undefined ? props : { ...props, key });
}

export function projectTree(tree: Nodes, components?: Components | null): ElementDescriptor {
	return toJsxRuntime(tree, {
		Fragment,
		components: components as unknown as Partial<HastRuntimeComponents> | undefined,
		ignoreInvalidStyle: true,
		jsx,
		jsxs: jsx,
		passKeys: true,
		passNode: true,
	}) as ElementDescriptor;
}
