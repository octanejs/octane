// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@octanejs/testing-library';
import { afterEach, expect, it, vi } from 'vitest';

import Async from '../src/async.tsrx';
import { inputFor, optionTexts, type Option } from './upstream/helpers';

afterEach(cleanup);

it('reconciles default options and cache tokens without render-phase state updates', () => {
	const firstDefaults = [{ label: 'First', value: 'first' }];
	const secondDefaults = [{ label: 'Second', value: 'second' }];
	const loadOptions = vi.fn(function loadOptions(
		inputValue: string,
		callback: (options: readonly Option[]) => void,
	) {
		callback([{ label: inputValue, value: inputValue }]);
	});
	const result = render(Async, {
		props: {
			cacheOptions: 'first-cache',
			classNamePrefix: 'react-select',
			defaultOptions: firstDefaults,
			loadOptions,
			menuIsOpen: true,
		} as never,
	});

	expect(optionTexts(result.container)).toEqual(['First']);
	let input = inputFor(result.container);
	fireEvent.input(input, { target: { value: 'cached' } });
	fireEvent.input(input, { target: { value: '' } });
	fireEvent.input(input, { target: { value: 'cached' } });
	expect(loadOptions).toHaveBeenCalledTimes(1);

	result.rerender({
		props: {
			cacheOptions: 'second-cache',
			classNamePrefix: 'react-select',
			defaultOptions: secondDefaults,
			loadOptions,
			menuIsOpen: true,
		} as never,
	});

	expect(optionTexts(result.container)).toEqual(['cached']);
	input = inputFor(result.container);
	fireEvent.input(input, { target: { value: '' } });
	expect(optionTexts(result.container)).toEqual(['Second']);
	fireEvent.input(input, { target: { value: 'cached' } });
	expect(loadOptions).toHaveBeenCalledTimes(2);
});
