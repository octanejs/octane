// Ported from .base-ui/packages/react/src/form/Form.tsx (v1.6.0). A `<form noValidate>` with
// consolidated error handling: provides the real FormContext (field registry + errors), runs
// submit-time validation, and focuses the first invalid control. octane: native events;
// forwardRef → ref-as-prop.
import { createElement, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'octane';

import { S, subSlot } from './internal';
import { useRenderElement, type RenderProp } from './utils/useRenderElement';
import { useStableCallback } from './utils/useStableCallback';
import { useValueChanged } from './utils/useValueChanged';
import { FormContext, type FormContextValue, type Errors } from './utils/field/FormContext';
import { createChangeEventDetails, REASONS } from './utils/createChangeEventDetails';
import type { FormValidationMode } from './utils/field/constants';

export interface FormProps {
	validationMode?: FormValidationMode;
	errors?: Errors;
	onSubmit?: (event: any) => void;
	onFormSubmit?: (formValues: Record<string, any>, eventDetails: any) => void;
	actionsRef?: any;
	render?: RenderProp<Record<string, never>>;
	className?: string | ((state: Record<string, never>) => string | undefined);
	style?: Record<string, any>;
	ref?: any;
	[key: string]: any;
}

function Form(props: FormProps): any {
	const slot = S('Form');
	const {
		render,
		className,
		validationMode = 'onSubmit',
		errors: externalErrors,
		onSubmit,
		onFormSubmit,
		actionsRef,
		style,
		ref,
		...elementProps
	} = props;

	const formRef = useRef<{ fields: Map<string, any> }>(
		{ fields: new Map() },
		subSlot(slot, 'formRef'),
	);
	const submittedRef = useRef(false, subSlot(slot, 'submitted'));
	const submitAttemptedRef = useRef(false, subSlot(slot, 'attempted'));

	const focusControl = useStableCallback(
		(control: HTMLElement | null) => {
			if (!control) {
				return;
			}
			control.focus();
			if (control.tagName === 'INPUT') {
				(control as HTMLInputElement).select();
			}
		},
		subSlot(slot, 'focusControl'),
	);

	const [errors, setErrors] = useState<Errors | undefined>(externalErrors, subSlot(slot, 'errors'));

	useValueChanged(
		externalErrors,
		() => {
			setErrors(externalErrors);
		},
		subSlot(slot, 'errorsChanged'),
	);

	useEffect(
		() => {
			if (!submittedRef.current) {
				return;
			}
			submittedRef.current = false;
			const invalidFields = Array.from(formRef.current.fields.values()).filter(
				(field: any) => field.validityData.state.valid === false,
			);
			if (invalidFields.length) {
				focusControl(invalidFields[0].controlRef.current);
			}
		},
		[errors, focusControl],
		subSlot(slot, 'e:focus'),
	);

	const handleImperativeValidate = useStableCallback(
		(fieldName?: string) => {
			const values = Array.from(formRef.current.fields.values());
			if (fieldName) {
				const namedField = values.find((field: any) => field.name === fieldName);
				if (namedField) {
					(namedField as any).validate();
				}
			} else {
				values.forEach((field: any) => {
					field.validate();
				});
			}
		},
		subSlot(slot, 'imperativeValidate'),
	);

	useImperativeHandle(
		actionsRef,
		() => ({ validate: handleImperativeValidate }),
		[handleImperativeValidate],
		subSlot(slot, 'imperative'),
	);

	const element = useRenderElement(
		'form',
		{ render, className, style },
		{
			ref,
			props: [
				{
					noValidate: true,
					onSubmit(event: any) {
						submitAttemptedRef.current = true;
						let values = Array.from(formRef.current.fields.values());
						values.forEach((field: any) => {
							field.validate();
						});
						values = Array.from(formRef.current.fields.values());
						const invalidField = values.find(
							(field: any) => field.validityData.state.valid === false,
						);
						if (invalidField) {
							event.preventDefault();
							focusControl((invalidField as any).controlRef.current);
						} else {
							submittedRef.current = true;
							onSubmit?.(event);
							if (onFormSubmit) {
								event.preventDefault();
								const formValues = values.reduce((acc: Record<string, any>, field: any) => {
									if (field.name) {
										acc[field.name] = field.getValue();
									}
									return acc;
								}, {});
								onFormSubmit(formValues, createChangeEventDetails(REASONS.none, event));
							}
						}
					},
				},
				elementProps,
			],
		},
		subSlot(slot, 're'),
	);

	const clearErrors = useStableCallback(
		(name: string | undefined) => {
			if (name && errors && Object.prototype.hasOwnProperty.call(errors, name)) {
				const nextErrors = { ...errors };
				delete nextErrors[name];
				setErrors(nextErrors);
			}
		},
		subSlot(slot, 'clearErrors'),
	);

	const contextValue: FormContextValue = useMemo(
		() => ({
			formRef,
			validationMode,
			errors: errors ?? {},
			clearErrors,
			submitAttemptedRef,
		}),
		[formRef, validationMode, errors, clearErrors],
		subSlot(slot, 'ctx'),
	);

	return createElement(FormContext.Provider, { value: contextValue, children: element });
}

export { Form };
