// Ported from .base-ui/packages/react/src/internals/field-register-control/useRegisterFieldControl.ts.
// Registers a control with the enclosing <Field.Root> (noop when standalone).
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useLayoutEffect, useRef } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import { useFieldRootContext } from './FieldRootContext';

export function useRegisterFieldControl(...args: any[]): void {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useRegisterFieldControl');
	const controlRef = user[0];
	const id = user[1];
	const value = user[2];
	const getFormValueOverride = user[3];
	const enabled = (user[4] as boolean | undefined) ?? true;
	const name = user[5];

	const { registerFieldControl } = useFieldRootContext();
	const sourceRef = useRef<symbol | null>(null, subSlot(slot, 'src'));
	if (!sourceRef.current) {
		sourceRef.current = Symbol();
	}

	useLayoutEffect(
		() => {
			const source = sourceRef.current;
			if (!source || !enabled) {
				return undefined;
			}
			const registration = { controlRef, getValue: getFormValueOverride, id, name, value };
			registerFieldControl(source, registration);
			return () => {
				registerFieldControl(source, undefined);
			};
		},
		[controlRef, enabled, getFormValueOverride, id, name, registerFieldControl, value],
		subSlot(slot, 'e:reg'),
	);
}
