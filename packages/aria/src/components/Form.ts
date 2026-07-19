// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Form.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// is `props.ref`, passed into `useContextProps` explicitly and re-applied as the merged object
// ref; the plain-`.ts` component uses the S()/subSlot component-slot convention;
// FormValidationContext comes from the binding's stately port.
import type { FormProps as SharedFormProps } from '@react-types/shared';
import { createContext, createElement } from 'octane';

import { FormValidationContext } from '../stately/form/useFormValidationState';
import { S, subSlot } from '../internal';
import {
	type ContextValue,
	dom,
	type DOMProps,
	type DOMRenderProps,
	useContextProps,
} from './utils';

// octane adaptation: structural bag (upstream's `GlobalDOMAttributes` drags React handler types).
type GlobalDOMAttributes = Record<string, any>;

export interface FormProps
	extends SharedFormProps, DOMProps, DOMRenderProps<'form', undefined>, GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element.
	 *
	 * @default 'react-aria-Form'
	 */
	className?: string;
	/**
	 * Whether to use native HTML form validation to prevent form submission
	 * when a field value is missing or invalid, or mark fields as required
	 * or invalid via ARIA.
	 *
	 * @default 'native'
	 */
	validationBehavior?: 'aria' | 'native';
}

export const FormContext = createContext<ContextValue<FormProps, HTMLFormElement>>(null);

/**
 * A form is a group of inputs that allows users to submit data to a server,
 * with support for providing field validation errors.
 */
export function Form(props: FormProps): any {
	const slot = S('Form');
	let ref: any;
	[props, ref] = useContextProps(props, props.ref, FormContext, subSlot(slot, 'ctx'));
	let { validationErrors, validationBehavior = 'native', children, className, ...domProps } = props;
	return createElement(dom.form, {
		noValidate: validationBehavior !== 'native',
		...domProps,
		ref,
		className: className || 'react-aria-Form',
		children: createElement(FormContext.Provider, {
			value: { ...props, validationBehavior },
			children: createElement(FormValidationContext.Provider, {
				value: validationErrors ?? {},
				children,
			}),
		}),
	});
}
