// Ported from styled-components 6.4.3 (MIT). Octane adaptation of the inlined
// hoist-non-react-statics: octane components are plain functions (no
// forwardRef/memo exotic objects), so the React `$$typeof` static tables
// collapse to one component-statics list.
import { AnyComponent } from '../types';
import { STYLED_COMPONENT_BRAND } from './isStyledComponent';

const COMPONENT_STATICS = {
	defaultProps: true,
	displayName: true,
	propTypes: true,
};

const KNOWN_STATICS = {
	name: true,
	length: true,
	prototype: true,
	caller: true,
	callee: true,
	arguments: true,
	arity: true,
};

const defineProperty = Object.defineProperty;
const getOwnPropertyNames = Object.getOwnPropertyNames;
const getOwnPropertySymbols = Object.getOwnPropertySymbols;
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const getPrototypeOf = Object.getPrototypeOf;
const objectPrototype = Object.prototype;

type ExcludeList = {
	[key: string]: true;
};

export type NonOctaneStatics<S extends AnyComponent, C extends ExcludeList = {}> = {
	[key in Exclude<
		keyof S,
		keyof typeof COMPONENT_STATICS | keyof typeof KNOWN_STATICS | keyof C
	>]: S[key];
};

export default function hoistNonOctaneStatics<
	T extends AnyComponent,
	S extends AnyComponent,
	C extends ExcludeList = {},
>(targetComponent: T, sourceComponent: S, excludelist?: C | undefined) {
	if (typeof sourceComponent !== 'string') {
		// don't hoist over string (html) components

		const inheritedComponent = getPrototypeOf(sourceComponent);
		if (inheritedComponent && inheritedComponent !== objectPrototype) {
			hoistNonOctaneStatics(targetComponent, inheritedComponent, excludelist);
		}

		const keys: (string | symbol)[] = (
			getOwnPropertyNames(sourceComponent) as (string | symbol)[]
		).concat(getOwnPropertySymbols(sourceComponent));

		for (let i = 0; i < keys.length; ++i) {
			const key = keys[i] as string;
			if (
				// The styled brand must never transfer to a wrapping component: a HOC
				// that hoists a styled component's statics is not itself styleable via
				// component selectors (see utils/isStyledComponent.ts).
				(key as unknown) !== STYLED_COMPONENT_BRAND &&
				!(key in KNOWN_STATICS) &&
				!(key in COMPONENT_STATICS) &&
				!(excludelist && excludelist[key])
			) {
				const descriptor = getOwnPropertyDescriptor(sourceComponent, key);

				try {
					// Avoid failures from read-only properties
					defineProperty(targetComponent, key, descriptor!);
				} catch (e) {
					/* ignore */
				}
			}
		}
	}

	return targetComponent as T & NonOctaneStatics<S, C>;
}
