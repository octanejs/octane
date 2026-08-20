import { useCallback, useEffect, useMemo, useRef, useState } from 'octane';
import type { ViewModelInstance, ViewModelInstanceValue } from '@rive-app/canvas';
import { splitSlot, subSlot } from '../internal.ts';

export type ViewModelInstancePropertyOptions<
	P extends ViewModelInstanceValue,
	V,
	R,
	E = undefined,
> = {
	/** Function to get the property from a ViewModelInstance */
	getProperty: (vm: ViewModelInstance, path: string) => P | null;

	/** Function to get the current value from the property */
	getValue: (prop: P) => V;

	/** Default value to use when property is unavailable */
	defaultValue: V | null;

	/**
	 * Function to create the property-specific operations
	 *
	 * @param safePropertyAccess - Helper function for safely working with properties. Handles stale property references.
	 * @returns Object with operations like setValue, trigger, etc.
	 */
	buildPropertyOperations: (safePropertyAccess: (callback: (prop: P) => void) => void) => R;

	/** Optional callback for property events (mainly used by triggers) */
	onPropertyEvent?: () => void;

	/**
	 * Optional function to extract additional property data (like enum values)
	 * Returns undefined if not provided
	 */
	getExtendedData?: (prop: P) => E;
};

/**
 * Base hook for all ViewModelInstance property interactions.
 *
 * This hook handles the common tasks needed when working with Rive properties:
 * 1. Safely accessing properties (even during hot-reload)
 * 2. Keeping React state in sync with property changes
 * 3. Providing type safety for all operations
 *
 * @param path - Property path in the ViewModelInstance
 * @param viewModelInstance - The source ViewModelInstance
 * @param options - Configuration for working with the property
 * @returns Object with the value and operations
 */
export function useViewModelInstanceProperty<P extends ViewModelInstanceValue, V, R, E = undefined>(
	...rawArgs: unknown[]
): R & { value: V | null } & (E extends undefined ? {} : { extendedData: E | null }) {
	const [args, slot] = splitSlot(rawArgs);
	const path = args[0] as string;
	const viewModelInstance = args[1] as ViewModelInstance | null | undefined;
	const options = args[2] as ViewModelInstancePropertyOptions<P, V, R, E>;

	const [property, setProperty] = useState<P | null>(null, subSlot(slot, 'property'));
	const [value, setValue] = useState<V | null>(options.defaultValue, subSlot(slot, 'value'));
	const [extendedData, setExtendedData] = useState<E | null>(null, subSlot(slot, 'extended'));

	const instanceRef = useRef<ViewModelInstance | null | undefined>(null, subSlot(slot, 'instance'));
	const pathRef = useRef<string>(path, subSlot(slot, 'path'));
	const optionsRef = useRef(options, subSlot(slot, 'options'));

	useEffect(
		function storeOptions() {
			optionsRef.current = options;
		},
		[options],
		subSlot(slot, 'storeOptions'),
	);

	const updateProperty = useCallback(
		function refreshProperty() {
			const currentInstance = instanceRef.current;
			const currentPath = pathRef.current;
			const currentOptions = optionsRef.current;

			if (!currentInstance || !currentPath) {
				setProperty(null);
				setValue(currentOptions.defaultValue);
				setExtendedData(null);
				return function noop() {};
			}

			const prop = currentOptions.getProperty(currentInstance, currentPath);
			if (prop) {
				const activeProp = prop;
				setProperty(activeProp);
				setValue(currentOptions.getValue(activeProp));

				if (currentOptions.getExtendedData) {
					setExtendedData(currentOptions.getExtendedData(activeProp));
				}

				function handleChange() {
					setValue(currentOptions.getValue(activeProp));

					if (currentOptions.getExtendedData) {
						setExtendedData(currentOptions.getExtendedData(activeProp));
					}

					if (currentOptions.onPropertyEvent) {
						currentOptions.onPropertyEvent();
					}
				}

				prop.on(handleChange);

				return function unsubscribe() {
					prop.off(handleChange);
				};
			}

			return function noop() {};
		},
		[],
		subSlot(slot, 'update'),
	);

	useEffect(
		function subscribe() {
			instanceRef.current = viewModelInstance;
			pathRef.current = path;

			// subscribe & get our unsubscribe function
			const cleanup = updateProperty();
			return cleanup;
		},
		[viewModelInstance, path, updateProperty],
		subSlot(slot, 'subscribe'),
	);

	/**
	 * Helper function that safely accesses properties, even during hot-reload.
	 *
	 * It tries to:
	 * 1. Use the existing property reference when possible
	 * 2. Fetch a fresh reference when needed
	 * 3. Apply the callback to whichever reference works
	 */
	const safePropertyAccess = useCallback(
		function access(callback: (prop: P) => void) {
			// Try the fast path first
			if (property && instanceRef.current === viewModelInstance) {
				try {
					callback(property);

					// Update extended data after callback if available
					if (optionsRef.current.getExtendedData) {
						setExtendedData(optionsRef.current.getExtendedData(property));
					}
					return;
				} catch {
					// Property might be stale - so we silently catch and try alternative
					// This commonly happens during hot module replacement
				}
			}

			// Get a fresh property if needed
			if (instanceRef.current) {
				try {
					const freshProp = optionsRef.current.getProperty(instanceRef.current, pathRef.current);
					if (freshProp) {
						setProperty(freshProp);
						callback(freshProp);

						// Update extended data after callback if available
						if (optionsRef.current.getExtendedData) {
							setExtendedData(optionsRef.current.getExtendedData(freshProp));
						}
					}
				} catch {
					// Silently fail during hot-reload - this is expected behavior
					// We don't want to crash the app during development
				}
			}
		},
		[property, viewModelInstance],
		subSlot(slot, 'safeAccess'),
	);

	const operations = useMemo(
		function buildOps() {
			return optionsRef.current.buildPropertyOperations(safePropertyAccess);
		},
		[safePropertyAccess],
		subSlot(slot, 'ops'),
	);

	const result = {
		value: value,
		...operations,
	} as R & { value: V | null } & (E extends undefined ? {} : { extendedData: E | null });

	if (options.getExtendedData) {
		(result as { extendedData: E | null }).extendedData = extendedData;
	}

	return result;
}
