import { useState } from 'octane';

export function getInputOnChange<T>(
	setValue: (value: null | undefined | T | ((current: T) => T)) => void,
) {
	return (val: null | undefined | T | React.ChangeEvent<any> | ((current: T) => T)) => {
		if (!val) {
			setValue(val as T);
		} else if (typeof val === 'function') {
			setValue(val);
		} else if (
			typeof val === 'object' &&
			(('currentTarget' in val && val.currentTarget != null) ||
				('target' in val && val.target != null))
		) {
			const currentTarget = ('currentTarget' in val && val.currentTarget) || (val as any).target;

			if (currentTarget.type === 'checkbox') {
				setValue((currentTarget as any).checked as any);
			} else {
				setValue(currentTarget.value as any);
			}
		} else {
			setValue(val as T);
		}
	};
}

export type UseInputStateReturnValue<T> = [
	T,
	(value: null | undefined | T | React.ChangeEvent<any>) => void,
];

export function useInputState<T>(initialState: T): UseInputStateReturnValue<T> {
	const [value, setValue] = useState<T>(initialState);
	return [value, getInputOnChange<T>(setValue as any)];
}

export namespace useInputState {
	export type ReturnValue<T> = UseInputStateReturnValue<T>;
}
