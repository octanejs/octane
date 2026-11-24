import { builders as b } from '@tsrx/core';

export const VALDI_HOOKS = new Set([
	'useState',
	'useCallback',
	'useLayoutEffect',
	'useMemo',
	'useRef',
]);
export const VALDI_COMPONENT_RUNTIME = new Set([
	...VALDI_HOOKS,
	'createContext',
	'useContext',
	'useSyncExternalStore',
	'useEffect',
	'useEffectEvent',
	'useLinkedState',
	'useId',
	'useInitialValue',
	'memo',
	'useLayoutSnapshot',
	'useLazyRef',
	'flushSync',
	'ErrorBoundary',
	'Suspense',
	'lazy',
]);

const RUNTIME_TYPES = new Map([
	['Context', 'Context'],
	['LinkedStatePrevious', 'LinkedStatePrevious'],
	['LinkedStateOptions', 'LinkedStateOptions'],
	['LayoutSnapshotOptions', 'LayoutSnapshotOptions'],
	['LayoutSnapshotOptionsWithInitial', 'LayoutSnapshotOptionsWithInitial'],
	['OctaneNode', 'ValdiChild'],
	['ReactNode', 'ValdiChild'],
	['FunctionComponent', 'ValdiComponent'],
	['ComponentType', 'ValdiComponent'],
	['FC', 'ValdiComponent'],
	['JSXElementConstructor', 'ValdiComponent'],
]);

// Hooks retain Octane's authored signatures, including compiler-selected getter
// tuples. Component values need the host's children and descriptor contracts.
const COMPONENT_VALUES = new Set([
	'memo',
	'createContext',
	'useContext',
	'ErrorBoundary',
	'Suspense',
	'lazy',
]);

/** Share the renderer's types with both its emitted code and virtual TSX. */
export function projectValdiRuntimeImports(ast, renderer, includeValues) {
	if (renderer.target !== 'valdi' || !renderer.capabilities?.includes('component-runtime')) {
		return ast;
	}
	let changed = false;
	const body = [];
	for (const node of ast.body) {
		if (node.type !== 'ImportDeclaration' || node.source.value !== 'octane') {
			body.push(node);
			continue;
		}
		const remaining = [];
		const routed = new Map();
		for (const specifier of node.specifiers) {
			const name = specifier.imported?.name ?? specifier.imported?.value;
			const typeOnly = node.importKind === 'type' || specifier.importKind === 'type';
			const target = typeOnly
				? RUNTIME_TYPES.get(name)
				: includeValues && COMPONENT_VALUES.has(name)
					? name
					: undefined;
			if (target === undefined && !(typeOnly && name === 'JSX' && renderer.intrinsics)) {
				remaining.push(specifier);
				continue;
			}
			const module = name === 'JSX' ? `${renderer.intrinsics}/jsx-runtime` : renderer.module;
			let specifiers = routed.get(module);
			if (specifiers === undefined) {
				specifiers = [];
				routed.set(module, specifiers);
			}
			specifiers.push({
				...specifier,
				imported: b.id(target ?? name, specifier.imported),
				importKind: typeOnly ? 'type' : 'value',
			});
		}
		if (routed.size === 0) {
			body.push(node);
			continue;
		}
		changed = true;
		if (remaining.length > 0) {
			body.push({ ...node, specifiers: remaining });
		}
		for (const [module, specifiers] of routed) {
			body.push({
				...node,
				source: b.literal(module, undefined, node.source),
				specifiers,
				importKind: 'value',
			});
		}
	}
	return changed ? { ...ast, body } : ast;
}
