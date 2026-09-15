// Adapted from react-hook-form@7.88.0 src/useResyncOnReconnect.ts for Octane.
import { useRef, useCallback } from 'octane';

import cloneObject from './utils/cloneObject';
import deepEqual from './utils/deepEqual';

export function useResyncOnReconnect<T>(getInitialValue?: () => T) {
	const _connected = useRef(false);
	const _initialized = useRef(false);
	const _prevValue = useRef<T | undefined>(undefined);
	const _renderCount = useRef(0);

	_renderCount.current++;

	if (!_initialized.current && getInitialValue) {
		_initialized.current = true;
		_prevValue.current = cloneObject(getInitialValue());
	}

	const resyncIfNeeded = useCallback(
		(enabled: boolean, getCurrentValue: () => T, setValue: (value: T) => void) => {
			if (enabled && (_connected.current || (_initialized.current && _renderCount.current > 1))) {
				const currentValue = getCurrentValue();

				if (!deepEqual(_prevValue.current, currentValue)) {
					setValue(currentValue);
				}
			}

			_connected.current = true;
		},
		[],
	);

	const snapshot = useCallback((enabled: boolean, getCurrentValue: () => T) => {
		if (enabled) {
			_prevValue.current = cloneObject(getCurrentValue());
		}
	}, []);

	return { resyncIfNeeded, snapshot };
}
