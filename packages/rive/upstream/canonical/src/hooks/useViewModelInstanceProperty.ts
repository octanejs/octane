import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ViewModelInstance, ViewModelInstanceValue } from '@rive-app/canvas';

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
    path: string,
    viewModelInstance: ViewModelInstance | null | undefined,
    options: {
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
    }
): R & { value: V | null } & (E extends undefined ? {} : { extendedData: E | null }) {
    const [property, setProperty] = useState<P | null>(null);
    const [value, setValue] = useState<V | null>(options.defaultValue);
    const [extendedData, setExtendedData] = useState<E | null>(null);

    const instanceRef = useRef<ViewModelInstance | null | undefined>(null);
    const pathRef = useRef<string>(path);
    const optionsRef = useRef(options);

    useEffect(() => {
        optionsRef.current = options;
    }, [options]);

    const updateProperty = useCallback(() => {
        const currentInstance = instanceRef.current;
        const currentPath = pathRef.current;
        const currentOptions = optionsRef.current;

        if (!currentInstance || !currentPath) {
            setProperty(null);
            setValue(currentOptions.defaultValue);
            setExtendedData(null);
            return () => { };
        }

        const prop = currentOptions.getProperty(currentInstance, currentPath);
        if (prop) {
            setProperty(prop);
            setValue(currentOptions.getValue(prop));

            if (currentOptions.getExtendedData) {
                setExtendedData(currentOptions.getExtendedData(prop));
            }

            const handleChange = () => {
                setValue(currentOptions.getValue(prop));

                if (currentOptions.getExtendedData) {
                    setExtendedData(currentOptions.getExtendedData(prop));
                }

                if (currentOptions.onPropertyEvent) {
                    currentOptions.onPropertyEvent();
                }
            };

            prop.on(handleChange);

            return () => {
                prop.off(handleChange);
            };
        }

        return () => { };
    }, []);

    useEffect(() => {
        instanceRef.current = viewModelInstance;
        pathRef.current = path;

        // subscribe & get our unsubscribe function
        const cleanup = updateProperty();
        return cleanup;
    }, [viewModelInstance, path, updateProperty]);

    /**
     * Helper function that safely accesses properties, even during hot-reload.
     * 
     * It tries to:
     * 1. Use the existing property reference when possible
     * 2. Fetch a fresh reference when needed
     * 3. Apply the callback to whichever reference works
     */
    const safePropertyAccess = useCallback(
        (callback: (prop: P) => void) => {
            // Try the fast path first
            if (property && instanceRef.current === viewModelInstance) {
                try {
                    callback(property);

                    // Update extended data after callback if available
                    if (optionsRef.current.getExtendedData) {
                        setExtendedData(optionsRef.current.getExtendedData(property));
                    }
                    return;
                } catch (e) {
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
                } catch (e) {
                    // Silently fail during hot-reload - this is expected behavior
                    // We don't want to crash the app during development
                }
            }
        },
        [property, viewModelInstance]
    );

    const operations = useMemo(
        () => optionsRef.current.buildPropertyOperations(safePropertyAccess),
        [safePropertyAccess]
    );

    const result = {
        value,
        ...operations
    } as R & { value: V | null } & (E extends undefined ? {} : { extendedData: E | null });

    if (options.getExtendedData) {
        (result as any).extendedData = extendedData;
    }

    return result;
} 