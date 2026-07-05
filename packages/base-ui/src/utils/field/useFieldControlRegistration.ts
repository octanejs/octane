// Ported from .base-ui/packages/react/src/internals/field-register-control/useFieldControlRegistration.ts.
// Registers the field's control with the enclosing <Form> (so submit-time validation + focus
// work) and exposes an imperative `validate`.
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useLayoutEffect, useRef } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import { getCombinedFieldValidityData } from './getCombinedFieldValidityData';
import { useFormContext } from './FormContext';
import { useStableCallback } from '../useStableCallback';
import type { FieldValidityData } from './constants';

export interface FieldControlRegistration {
	controlRef: { current: any };
	id: string | undefined;
	name?: string;
	getValue?: () => unknown;
	value: unknown;
}

export interface UseFieldControlRegistrationParameters {
	commit: (value: unknown) => void;
	invalid: boolean;
	markedDirtyRef: { current: boolean };
	name: string | undefined;
	setRegisteredFieldName: (name: string | undefined) => void;
	setRegisteredFieldId: (id: string | undefined) => void;
	setValidityData: (
		next: FieldValidityData | ((prev: FieldValidityData) => FieldValidityData),
	) => void;
	validityData: FieldValidityData;
}

export function useFieldControlRegistration(...args: any[]): readonly [() => void, any] {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useFieldControlRegistration');
	const {
		commit,
		invalid,
		markedDirtyRef,
		name,
		setRegisteredFieldName,
		setRegisteredFieldId,
		setValidityData,
		validityData,
	} = user[0] as UseFieldControlRegistrationParameters;

	const { formRef } = useFormContext();

	const activeFieldControlSourceRef = useRef<symbol | null>(null, subSlot(slot, 'active'));
	const registrationRef = useRef<FieldControlRegistration | null>(null, subSlot(slot, 'reg'));
	const fallbackControlRef = useRef<any>(null, subSlot(slot, 'fallback'));

	const getValueForForm = useStableCallback(
		() => {
			const registration = registrationRef.current;
			if (!registration) {
				return undefined;
			}
			if (registration.getValue) {
				return registration.getValue();
			}
			return registration.value;
		},
		subSlot(slot, 'getValue'),
	);

	function getRegistrationValue(registration: FieldControlRegistration): unknown {
		return registration.value === undefined ? getValueForForm() : registration.value;
	}

	const validate = useStableCallback(
		() => {
			const registration = registrationRef.current;
			markedDirtyRef.current = true;
			if (!registration) {
				commit(validityData.value);
				return;
			}
			commit(getRegistrationValue(registration));
		},
		subSlot(slot, 'validate'),
	);

	function refreshRegistration(): void {
		const registration = registrationRef.current;
		if (!registration || !registration.id) {
			return;
		}
		formRef.current.fields.set(registration.id, {
			getValue: getValueForForm,
			name: name ?? registration.name,
			controlRef: registration.controlRef ?? fallbackControlRef,
			validityData: getCombinedFieldValidityData(validityData, invalid),
			validate,
		});
	}

	function deleteRegistration(id = registrationRef.current?.id): void {
		if (id) {
			formRef.current.fields.delete(id);
		}
	}

	function syncInitialValue(): void {
		const registration = registrationRef.current;
		if (!registration) {
			return;
		}
		const initialValue = getRegistrationValue(registration);
		if (validityData.initialValue === null && initialValue !== null) {
			setValidityData((prev) => ({ ...prev, initialValue }));
		}
	}

	useLayoutEffect(
		() => {
			const registration = registrationRef.current;
			if (!registration || !registration.id) {
				return;
			}
			setRegisteredFieldName(name ? undefined : registration.name);
			formRef.current.fields.set(registration.id, {
				getValue: getValueForForm,
				name: name ?? registration.name,
				controlRef: registration.controlRef ?? fallbackControlRef,
				validityData: getCombinedFieldValidityData(validityData, invalid),
				validate,
			});
		},
		[formRef, getValueForForm, invalid, name, setRegisteredFieldName, validate, validityData],
		subSlot(slot, 'e:register'),
	);

	useLayoutEffect(
		() => {
			const fields = formRef.current.fields;
			return () => {
				const id = registrationRef.current?.id;
				if (id) {
					fields.delete(id);
				}
			};
		},
		[formRef],
		subSlot(slot, 'e:cleanup'),
	);

	const register = useStableCallback(
		(source: symbol, registration: FieldControlRegistration | undefined) => {
			if (!registration) {
				if (activeFieldControlSourceRef.current === source) {
					activeFieldControlSourceRef.current = null;
					deleteRegistration();
					registrationRef.current = null;
					setRegisteredFieldName(undefined);
					setRegisteredFieldId(undefined);
				}
				return;
			}
			const previousId = registrationRef.current?.id;
			activeFieldControlSourceRef.current = source;
			registrationRef.current = registration;
			if (!name) {
				setRegisteredFieldName(registration.name);
			}
			setRegisteredFieldId(registration.id);
			if (previousId && previousId !== registration.id) {
				deleteRegistration(previousId);
			}
			syncInitialValue();
			refreshRegistration();
		},
		subSlot(slot, 'register'),
	);

	return [validate, register] as const;
}
