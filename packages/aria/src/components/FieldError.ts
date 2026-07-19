// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/FieldError.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// is `props.ref` and rides the props spread into `FieldErrorInner`; the plain-`.ts` inner
// component uses the S()/subSlot component-slot convention (the outer component only reads
// context, which is context-identity keyed).
import type { DOMProps, ValidationResult } from '@react-types/shared';
import { createContext, createElement, useContext } from 'octane';

import { S, subSlot } from '../internal';
import { filterDOMProps } from '../utils/filterDOMProps';
import { Text } from './Text';
import { type ClassNameOrFunction, type RenderProps, useRenderProps } from './utils';

// octane adaptation: structural bag (upstream's `GlobalDOMAttributes` drags React handler types).
type GlobalDOMAttributes = Record<string, any>;

export const FieldErrorContext = createContext<ValidationResult | null>(null);

export interface FieldErrorRenderProps extends ValidationResult {}
export interface FieldErrorProps
	extends RenderProps<FieldErrorRenderProps>, DOMProps, GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-FieldError'
	 */
	className?: ClassNameOrFunction<FieldErrorRenderProps>;
	/**
	 * The HTML element type to render. Defaults to `'span'`.
	 * Set to `'div'` when using block-level children (e.g. `<ul>`) to avoid invalid HTML.
	 *
	 * @default 'span'
	 */
	elementType?: string;
}

/**
 * A FieldError displays validation errors for a form field.
 */
export function FieldError(props: FieldErrorProps): any {
	let validation = useContext(FieldErrorContext);
	if (!validation?.isInvalid) {
		return null;
	}

	return createElement(FieldErrorInner, { ...props });
}

function FieldErrorInner(props: FieldErrorProps & { ref?: any }): any {
	const slot = S('FieldErrorInner');
	let validation = useContext(FieldErrorContext)!;
	let { elementType, ref, ...restProps } = props;
	let domProps = filterDOMProps(restProps, { global: true })!;
	let renderProps = useRenderProps(
		{
			...restProps,
			defaultClassName: 'react-aria-FieldError',
			defaultChildren:
				validation.validationErrors.length === 0
					? undefined
					: validation.validationErrors.join(' '),
			values: validation,
		},
		subSlot(slot, 'render'),
	);

	if (renderProps.children == null) {
		return null;
	}

	return createElement(Text, {
		slot: 'errorMessage',
		elementType,
		...domProps,
		...renderProps,
		ref,
	});
}
