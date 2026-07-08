// Port of util/ReactUtils.tsx on octane's element-descriptor introspection
// (octane `Children`/`isValidElement` operate on descriptor values — arrays,
// single descriptors, primitives). NOTE the octane children model: STATIC JSX
// children compile to an opaque block function, which cannot be introspected —
// these helpers see descriptors only where children arrive as VALUES (arrays
// from .map(), elements passed through props). recharts' remaining
// children-introspection site (Cell) is ported to context REGISTRATION instead
// (see component/Cell), matching the redux-registration pattern recharts v3
// itself adopted for everything else.
import { Children } from 'octane';
import { isNullish } from './DataUtils';

export const SCALE_TYPES = [
	'auto',
	'linear',
	'pow',
	'sqrt',
	'log',
	'identity',
	'time',
	'band',
	'point',
	'ordinal',
	'quantile',
	'quantize',
	'utc',
	'sequential',
	'threshold',
];

/**
 * @deprecated instead find another approach that does not depend on displayName.
 */
export const getDisplayName = (Comp: unknown): string => {
	if (typeof Comp === 'string') {
		return Comp;
	}
	if (!Comp) {
		return '';
	}
	return (Comp as any).displayName || (Comp as any).name || 'Component';
};

// `toArray` gets called multiple times during the render
// so we can memoize last invocation (since reference to `children` is the same)
let lastChildren: unknown = null;
let lastResult: any[] | null = null;

/**
 * @deprecated instead find another approach that does not require reading elements from children.
 */
export const toArray = (children: unknown): any[] => {
	if (children === lastChildren && Array.isArray(lastResult)) {
		return lastResult;
	}
	const result: any[] = [];
	Children.forEach(children, (child: unknown) => {
		if (isNullish(child)) return;
		result.push(child);
	});
	lastResult = result;
	lastChildren = children;
	return result;
};

/**
 * @deprecated instead find another approach that does not require reading elements from children.
 *
 * Find and return all matched children by type (descriptor-valued children only —
 * see the module note).
 */
export function findAllByType(children: unknown, type: unknown | unknown[]): any[] {
	const result: any[] = [];
	let types: string[] = [];
	if (Array.isArray(type)) {
		types = type.map((t) => getDisplayName(t));
	} else {
		types = [getDisplayName(type)];
	}
	toArray(children).forEach((child) => {
		const childType = child?.type?.displayName || child?.type?.name;
		if (childType && types.indexOf(childType) !== -1) {
			result.push(child);
		}
	});
	return result;
}

export const isClipDot = (dot: unknown): boolean => {
	if (dot && typeof dot === 'object' && 'clipDot' in dot) {
		return Boolean((dot as any).clipDot);
	}
	return true;
};
