import { useCallback, useEffect, useLinkedState, useRef, useState } from 'octane';

import type { GroupBase, InputActionMeta, OptionsOrGroups } from './types';
import type { StateManagerProps } from './use-state-manager.tsrx';
import { handleInputChange } from './utils';

export interface AsyncAdditionalProps<Option, Group extends GroupBase<Option>> {
	defaultOptions?: OptionsOrGroups<Option, Group> | boolean;
	// Matches upstream's deliberately opaque cache invalidation token.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	cacheOptions?: any;
	loadOptions?: (inputValue: string, callback: (options: OptionsOrGroups<
		Option,
		Group
	>) => void) => Promise<OptionsOrGroups<Option, Group>> | void;
	isLoading?: boolean;
}

export type AsyncProps<Option, IsMulti extends boolean, Group extends GroupBase<Option>> =
	StateManagerProps<Option, IsMulti, Group> & AsyncAdditionalProps<Option, Group>;

export function useAsync<
	Option,
	IsMulti extends boolean = boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
>(
	props: AsyncProps<Option, IsMulti, Group>,
): AsyncProps<Option, IsMulti, Group> & {
	filterOption: unknown;
	isLoading: boolean;
	onInputChange: (newValue: string, actionMeta: InputActionMeta) => void;
	options: OptionsOrGroups<Option, Group>;
} {
	const {
		defaultOptions: propsDefaultOptions = false,
		cacheOptions = false,
		loadOptions: propsLoadOptions,
		options: _propsOptions,
		isLoading: propsIsLoading = false,
		onInputChange: propsOnInputChange,
		filterOption = null,
		...restSelectProps
	} = props;
	const { inputValue: propsInputValue } = restSelectProps;
	const lastRequest = useRef<unknown>(undefined);
	const mounted = useRef(false);
	const [defaultOptions, setDefaultOptions] = useLinkedState<
		OptionsOrGroups<Option, Group> | boolean,
		OptionsOrGroups<Option, Group> | undefined
	>(
		propsDefaultOptions,
		(nextDefaultOptions) => Array.isArray(nextDefaultOptions) ? nextDefaultOptions : undefined,
	);
	const [stateInputValue, setStateInputValue] = useState(
		typeof propsInputValue !== 'undefined' ? propsInputValue as string : '',
	);
	const [isLoading, setIsLoading] = useState(propsDefaultOptions === true);
	const [loadedInputValue, setLoadedInputValue] = useState<string | undefined>(undefined);
	const [loadedOptions, setLoadedOptions] = useState<OptionsOrGroups<Option, Group>>([]);
	const [passEmptyOptions, setPassEmptyOptions] = useState(false);
	const [optionsCache, setOptionsCache] = useLinkedState<
		unknown,
		Record<string, OptionsOrGroups<Option, Group>>
	>(cacheOptions, () => ({}), {
		// Preserve upstream's strict-equality cache-token comparison.
		sourceEqual: (previous, next) => previous === next,
	});

	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	const loadOptions = useCallback((
		inputValue: string,
		callback: (options?: OptionsOrGroups<Option, Group>) => void,
	) => {
		if (!propsLoadOptions) {
			callback();
			return;
		}
		const loader = propsLoadOptions(inputValue, callback);
		if (loader && typeof loader.then === 'function') loader.then(callback, () => callback());
	}, [propsLoadOptions]);

	useEffect(() => {
		if (propsDefaultOptions === true) {
			loadOptions(stateInputValue, (options) => {
				if (!mounted.current) return;
				setDefaultOptions(options || []);
				setIsLoading(Boolean(lastRequest.current));
			});
		}
	}, []);

	const onInputChange = useCallback((newValue: string, actionMeta: InputActionMeta) => {
		const inputValue = handleInputChange(newValue, actionMeta, propsOnInputChange);
		if (!inputValue) {
			lastRequest.current = undefined;
			setStateInputValue('');
			setLoadedInputValue('');
			setLoadedOptions([]);
			setIsLoading(false);
			setPassEmptyOptions(false);
			return;
		}
		if (cacheOptions && optionsCache[inputValue]) {
			setStateInputValue(inputValue);
			setLoadedInputValue(inputValue);
			setLoadedOptions(optionsCache[inputValue]);
			setIsLoading(false);
			setPassEmptyOptions(false);
			return;
		}
		const request = lastRequest.current = {};
		setStateInputValue(inputValue);
		setIsLoading(true);
		setPassEmptyOptions(!loadedInputValue);
		loadOptions(inputValue, (options) => {
			if (!mounted.current || request !== lastRequest.current) return;
			lastRequest.current = undefined;
			setIsLoading(false);
			setLoadedInputValue(inputValue);
			setLoadedOptions(options || []);
			setPassEmptyOptions(false);
			setOptionsCache(options ? { ...optionsCache, [inputValue]: options } : optionsCache);
		});
	}, [cacheOptions, loadOptions, loadedInputValue, optionsCache, propsOnInputChange]);

	const options =
		passEmptyOptions
			? []
			: stateInputValue && loadedInputValue
				? loadedOptions
				: (defaultOptions || []) as OptionsOrGroups<Option, Group>;

	return {
		...restSelectProps,
		options,
		isLoading: isLoading || propsIsLoading,
		onInputChange,
		filterOption,
	};
}
