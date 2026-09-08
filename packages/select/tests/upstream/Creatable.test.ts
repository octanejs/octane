// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@octanejs/testing-library';
import { afterEach, expect, vi } from 'vitest';

import Creatable from '../../src/creatable.tsrx';
import { OPTIONS, upstreamTest } from './helpers';

afterEach(cleanup);

upstreamTest('defaults - snapshot', function snapshotsDefaults() {
	const result = render(Creatable);
	expect(result.container).toMatchSnapshot();
});

interface CustomOption {
	readonly key: string;
	readonly title: string;
}

const CUSTOM_OPTIONS: readonly CustomOption[] = [
	{ key: 'testa', title: 'Test A' },
	{ key: 'testb', title: 'Test B' },
	{ key: 'testc', title: 'Test C' },
	{ key: 'testd', title: 'Test D' },
];

function menuText(container: HTMLElement): string {
	return container.querySelector('.react-select__menu')?.textContent ?? '';
}

function creatableProps(overrides: Record<string, unknown> = {}): never {
	return {
		className: 'react-select',
		classNamePrefix: 'react-select',
		menuIsOpen: true,
		options: OPTIONS,
		...overrides,
	} as never;
}

function renderCreatable(overrides: Record<string, unknown> = {}) {
	return render(Creatable, { props: creatableProps(overrides) });
}

function assertExactMatch(isMulti: boolean): void {
	const result = renderCreatable({ isMulti });
	result.rerender({ props: creatableProps({ isMulti, inputValue: 'one' }) });
	expect(menuText(result.container).toLowerCase()).not.toContain('create');
}

upstreamTest(
	'filtered option is an exact match for an existing option single select > should not show "create..." prompt"',
	function hidesCreateForSingleExactMatch() {
		assertExactMatch(false);
	},
);

upstreamTest(
	'filtered option is an exact match for an existing option multi select > should not show "create..." prompt"',
	function hidesCreateForMultiExactMatch() {
		assertExactMatch(true);
	},
);

function assertInvalidFilter(isMulti: boolean): void {
	function filterOption(): null {
		return null;
	}
	const result = renderCreatable({ filterOption, isMulti });
	result.rerender({
		props: creatableProps({ filterOption, inputValue: 'one', isMulti }),
	});
	expect(
		result.container.querySelector('.react-select__menu-notice--no-options')?.textContent,
	).toContain('No options');
}

upstreamTest(
	'filterOptions returns invalid value ( null ) single select > should not show "create..." prompt"',
	function handlesSingleInvalidFilter() {
		assertInvalidFilter(false);
	},
);

upstreamTest(
	'filterOptions returns invalid value ( null ) multi select > should not show "create..." prompt"',
	function handlesMultiInvalidFilter() {
		assertInvalidFilter(true);
	},
);

function assertCreatePrompt(isMulti: boolean): void {
	const result = renderCreatable({ isMulti });
	result.rerender({
		props: creatableProps({
			inputValue: 'option not is list',
			isMulti,
		}),
	});
	expect(menuText(result.container)).toBe('Create "option not is list"');
}

upstreamTest(
	'inputValue does not match any option after filter single select > should show a placeholder "create..." prompt',
	function showsSingleCreatePrompt() {
		assertCreatePrompt(false);
	},
);

upstreamTest(
	'inputValue does not match any option after filter multi select > should show a placeholder "create..." prompt',
	function showsMultiCreatePrompt() {
		assertCreatePrompt(true);
	},
);

function assertValidityCallback(isMulti: boolean): void {
	function isValidNewOption(value: string): boolean {
		return value === 'new Option';
	}
	const result = renderCreatable({ isMulti, isValidNewOption });
	result.rerender({
		props: creatableProps({
			inputValue: 'new Option',
			isMulti,
			isValidNewOption,
		}),
	});
	expect(menuText(result.container)).toBe('Create "new Option"');
	result.rerender({
		props: creatableProps({
			inputValue: 'invalid new Option',
			isMulti,
			isValidNewOption,
		}),
	});
	expect(menuText(result.container)).not.toBe('Create "invalid new Option"');
}

upstreamTest(
	'isValidNewOption() prop single select > should show "create..." prompt only if isValidNewOption returns thruthy value',
	function honorsSingleValidityCallback() {
		assertValidityCallback(false);
	},
);

upstreamTest(
	'isValidNewOption() prop multi select > should show "create..." prompt only if isValidNewOption returns thruthy value',
	function honorsMultiValidityCallback() {
		assertValidityCallback(true);
	},
);

function assertNewOptionData(isMulti: boolean): void {
	function getNewOptionData(label: string) {
		return { label: `custom text ${label}`, value: label };
	}
	const result = renderCreatable({ getNewOptionData, isMulti });
	result.rerender({
		props: creatableProps({
			getNewOptionData,
			inputValue: 'new Option',
			isMulti,
		}),
	});
	expect(menuText(result.container)).toBe('custom text new Option');
}

upstreamTest(
	'getNewOptionData() prop single select > should create option as per label returned from getNewOptionData',
	function usesSingleNewOptionData() {
		assertNewOptionData(false);
	},
);

upstreamTest(
	'getNewOptionData() prop multi select > should create option as per label returned from getNewOptionData',
	function usesMultiNewOptionData() {
		assertNewOptionData(true);
	},
);

function assertCreateLabel(isMulti: boolean): void {
	function formatCreateLabel(label: string): string {
		return `custom label "${label}"`;
	}
	const result = renderCreatable({ formatCreateLabel, isMulti });
	result.rerender({
		props: creatableProps({
			formatCreateLabel,
			inputValue: 'new Option',
			isMulti,
		}),
	});
	expect(menuText(result.container)).toBe('custom label "new Option"');
}

upstreamTest(
	'formatCreateLabel() prop single select > should show label of custom option as per text returned from formatCreateLabel',
	function formatsSingleCreateLabel() {
		assertCreateLabel(false);
	},
);

upstreamTest(
	'formatCreateLabel() prop multi select > should show label of custom option as per text returned from formatCreateLabel',
	function formatsMultiCreateLabel() {
		assertCreateLabel(true);
	},
);

function assertCustomComparison(isMulti: boolean): void {
	const getOptionLabel = vi.fn(function getOptionLabel(option: CustomOption) {
		return option.title;
	});
	const getOptionValue = vi.fn(function getOptionValue(option: CustomOption) {
		return option.key;
	});
	const result = renderCreatable({
		getOptionLabel,
		getOptionValue,
		isMulti,
		options: CUSTOM_OPTIONS,
	});
	result.rerender({
		props: creatableProps({
			getOptionLabel,
			getOptionValue,
			inputValue: 'testc',
			isMulti,
			options: CUSTOM_OPTIONS,
		}),
	});
	expect(menuText(result.container)).toBe('Test C');
}

upstreamTest(
	'compareOption() method single select > should handle options with custom structure',
	function comparesSingleCustomOption() {
		assertCustomComparison(false);
	},
);

upstreamTest(
	'compareOption() method multi select > should handle options with custom structure',
	function comparesMultiCustomOption() {
		assertCustomComparison(true);
	},
);

function assertEscapeWithSearchText(isMulti: boolean): void {
	const result = renderCreatable({ inputValue: 'new Option', isMulti });
	fireEvent.keyDown(result.container, { key: 'Escape', keyCode: 27 });
	expect(result.container.querySelector('input')?.textContent).toBe('');
}

upstreamTest(
	'close by hitting escape with search text present single select > should remove the search text',
	function clearsSingleSearchOnEscape() {
		assertEscapeWithSearchText(false);
	},
);

upstreamTest(
	'close by hitting escape with search text present multi select > should remove the search text',
	function clearsMultiSearchOnEscape() {
		assertEscapeWithSearchText(true);
	},
);

upstreamTest(
	'should remove the new option after closing on blur',
	function clearsNewOptionOnBlur() {
		const result = renderCreatable({ inputValue: 'new Option' });
		fireEvent.blur(result.container);
		expect(result.container.querySelector('input')?.textContent).toBe('');
	},
);
