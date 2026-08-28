// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@octanejs/testing-library';
import { createElement } from 'octane';
import { afterEach, expect, vi } from 'vitest';

import { Select } from '../../src/select.tsrx';
import { hiddenInput, inputFor, OPTIONS, optionTexts, type Option, upstreamTest } from './helpers';

afterEach(cleanup);

interface NumberOption {
	readonly label: string;
	readonly value: number;
}

const NUMBER_OPTIONS: readonly NumberOption[] = [
	{ label: '0', value: 0 },
	{ label: '1', value: 1 },
	{ label: '2', value: 2 },
	{ label: '3', value: 3 },
];

interface BooleanOption {
	readonly label: string;
	readonly value: boolean;
}

const BOOLEAN_OPTIONS: readonly BooleanOption[] = [
	{ label: 'true', value: true },
	{ label: 'false', value: false },
];

const GROUPED_OPTIONS = [
	{
		label: 'Numbers',
		options: [
			{ label: '0', value: 0 },
			{ label: '1', value: 1 },
			{ label: '2', value: 2 },
			{ label: '3', value: 3 },
			{ label: '4', value: 4 },
			{ label: '5', value: 5 },
			{ label: '6', value: 6 },
			{ label: '7', value: 7 },
			{ label: '8', value: 8 },
			{ label: '9', value: 9 },
			{ label: '10', value: 10 },
		],
	},
	{
		label: 'Booleans',
		options: BOOLEAN_OPTIONS,
	},
] as const;

const ACCENTED_OPTIONS: readonly Option[] = [
	{ label: 'school', value: 'en' },
	{ label: 'école', value: 'fr' },
];

function basicProps(overrides: Record<string, unknown> = {}): never {
	return {
		className: 'react-select',
		classNamePrefix: 'react-select',
		inputValue: '',
		name: 'test-input-name',
		onChange: vi.fn(),
		onInputChange: vi.fn(),
		onMenuClose: vi.fn(),
		onMenuOpen: vi.fn(),
		options: OPTIONS,
		value: null,
		...overrides,
	} as never;
}

function renderSelect(overrides: Record<string, unknown> = {}) {
	return render(Select, { props: basicProps(overrides) });
}

function menu(container: HTMLElement): Element | null {
	return container.querySelector('.react-select__menu');
}

upstreamTest('snapshot - defaults', function snapshotsDefaults() {
	const result = render(Select);
	expect(result.container).toMatchSnapshot();
});

upstreamTest(
	'instanceId prop > to have instanceId as id prefix for the select components',
	function appliesInstanceId() {
		const result = renderSelect({ instanceId: 'custom-id', menuIsOpen: true });
		expect(inputFor(result.container).id).toContain('custom-id');
		const options = result.container.querySelectorAll<HTMLElement>('.react-select__option');
		for (const option of options) expect(option.id).toContain('custom-id');
	},
);

upstreamTest(
	'hidden input field is not present if name is not passes',
	function omitsUnnamedInput() {
		const result = renderSelect({ name: undefined });
		expect(result.container.querySelector('input[type="hidden"]')).toBeNull();
	},
);

upstreamTest('hidden input field is present if name passes', function rendersNamedInput() {
	const result = renderSelect();
	expect(result.container.querySelector('input[type="hidden"]')).toBeTruthy();
});

upstreamTest(
	'single select > passing multiple values > should select the first value',
	function selectsFirstValue() {
		const result = renderSelect({ value: [OPTIONS[0], OPTIONS[4]] });
		expect(result.container.querySelector('.react-select__control')?.textContent).toBe('0');
	},
);

upstreamTest('isRtl boolean prop sets direction: rtl on container', function appliesRtlDirection() {
	const result = renderSelect({ isClearable: true, isRtl: true, value: [OPTIONS[0]] });
	expect(window.getComputedStyle(result.container.firstChild as HTMLElement).direction).toBe('rtl');
});

upstreamTest(
	'isOptionSelected() prop > single select > mark value as isSelected if isOptionSelected returns true for the option',
	function marksCustomSelectedOption() {
		function isOptionSelected(option: Option): boolean {
			return option.label !== '1';
		}
		const result = renderSelect({ isOptionSelected, menuIsOpen: true });
		const options = result.container.querySelectorAll<HTMLElement>('.react-select__option');
		expect(options[0].classList).toContain('react-select__option--is-selected');
		expect(options[1].classList).not.toContain('react-select__option--is-selected');
	},
);

upstreamTest(
	'isOptionSelected() prop > multi select > to not show the selected options in Menu for multiSelect',
	function hidesCustomSelectedOptions() {
		function isOptionSelected(option: Option): boolean {
			return option.label !== '1';
		}
		const result = renderSelect({ isMulti: true, isOptionSelected, menuIsOpen: true });
		expect(optionTexts(result.container)).toEqual(['1']);
	},
);

function assertFormattedOption(isMulti: boolean): void {
	function formatOptionLabel(option: Option, meta: { context: string }): string {
		return `${option.label} ${option.value} ${meta.context}`;
	}
	const result = renderSelect({ formatOptionLabel, isMulti, value: OPTIONS[0] });
	const selector = isMulti ? '.react-select__multi-value' : '.react-select__single-value';
	expect(result.container.querySelector(selector)?.textContent).toBe('0 zero value');
}

upstreamTest(
	'formatOptionLabel single select > should format label of options according to text returned by formatOptionLabel',
	function formatsSingleOption() {
		assertFormattedOption(false);
	},
);

upstreamTest(
	'formatOptionLabel multi select > should format label of options according to text returned by formatOptionLabel',
	function formatsMultiOption() {
		assertFormattedOption(true);
	},
);

upstreamTest('name prop single select > should assign the given name', function namesSingleInput() {
	const result = renderSelect({ name: 'form-field-single-select' });
	expect(hiddenInput(result.container).name).toBe('form-field-single-select');
});

upstreamTest('name prop multi select > should assign the given name', function namesMultiInput() {
	const result = renderSelect({
		isMulti: true,
		name: 'form-field-multi-select',
		value: OPTIONS[2],
	});
	expect(hiddenInput(result.container).name).toBe('form-field-multi-select');
});

function assertControlledMenu(isMulti: boolean): void {
	const result = renderSelect({ isMulti });
	expect(menu(result.container)).toBeNull();
	result.rerender({ props: basicProps({ isMulti, menuIsOpen: true }) });
	expect(menu(result.container)).toBeTruthy();
	result.rerender({ props: basicProps({ isMulti }) });
	expect(menu(result.container)).toBeNull();
}

upstreamTest(
	'menuIsOpen prop single select > should show menu if menuIsOpen is true and hide menu if menuIsOpen prop is false',
	function controlsSingleMenu() {
		assertControlledMenu(false);
	},
);

upstreamTest(
	'menuIsOpen prop multi select > should show menu if menuIsOpen is true and hide menu if menuIsOpen prop is false',
	function controlsMultiMenu() {
		assertControlledMenu(true);
	},
);

function assertDefaultFilter(search: string): void {
	const result = renderSelect({ menuIsOpen: true, options: ACCENTED_OPTIONS });
	result.rerender({
		props: basicProps({ inputValue: search, menuIsOpen: true, options: ACCENTED_OPTIONS }),
	});
	expect(optionTexts(result.container)).toHaveLength(1);
}

upstreamTest(
	'filterOption() prop - default filter behavior single select > should match accented char',
	function matchesAccentedOption() {
		assertDefaultFilter('ecole');
	},
);

upstreamTest(
	'filterOption() prop - default filter behavior single select > should ignore accented char in query',
	function ignoresQueryAccent() {
		assertDefaultFilter('schoöl');
	},
);

function customFilter(option: { value: string }, search: string): boolean {
	return option.value.includes(search);
}

function assertCustomFilter(isMulti: boolean, expected: number): void {
	const result = renderSelect({
		filterOption: customFilter,
		isMulti,
		menuIsOpen: true,
		value: OPTIONS[0],
	});
	result.rerender({
		props: basicProps({
			filterOption: customFilter,
			inputValue: 'o',
			isMulti,
			menuIsOpen: true,
			value: OPTIONS[0],
		}),
	});
	expect(optionTexts(result.container)).toHaveLength(expected);
}

upstreamTest(
	'filterOption() prop - should filter only if function returns truthy for value single select > should filter all options as per searchString',
	function filtersSingleOptions() {
		assertCustomFilter(false, 5);
	},
);

upstreamTest(
	'filterOption() prop - should filter only if function returns truthy for value multi select > should filter all options other that options in value of select',
	function filtersMultiOptions() {
		assertCustomFilter(true, 4);
	},
);

function assertNullFilter(isMulti: boolean, expected: number): void {
	const result = renderSelect({
		filterOption: null,
		isMulti,
		menuIsOpen: true,
		value: OPTIONS[0],
	});
	result.rerender({
		props: basicProps({
			filterOption: null,
			inputValue: 'o',
			isMulti,
			menuIsOpen: true,
			value: OPTIONS[0],
		}),
	});
	expect(optionTexts(result.container)).toHaveLength(expected);
}

upstreamTest(
	'filterOption prop is null single select > should show all the options',
	function showsAllSingleOptions() {
		assertNullFilter(false, 17);
	},
);

upstreamTest(
	'filterOption prop is null multi select > should show all the options other than selected options',
	function showsUnselectedMultiOptions() {
		assertNullFilter(true, 16);
	},
);

function assertNoOptions(isMulti: boolean, message: string): void {
	function noOptionsMessage(): string {
		return message;
	}
	const result = renderSelect({
		filterOption: customFilter,
		inputValue: 'some text not in options',
		isMulti,
		menuIsOpen: true,
		noOptionsMessage,
	});
	const notice = result.container.querySelector('.react-select__menu-notice--no-options');
	expect(notice?.textContent).toBe(message);
}

upstreamTest(
	'no option found on search based on filterOption prop single Select > should show NoOptionsMessage',
	function showsSingleNoOptions() {
		assertNoOptions(false, 'No options');
	},
);

upstreamTest(
	'no option found on search based on filterOption prop multi select > should show NoOptionsMessage',
	function showsMultiNoOptions() {
		assertNoOptions(true, 'No options');
	},
);

upstreamTest(
	'noOptionsMessage() function prop single Select > should show NoOptionsMessage returned from noOptionsMessage function prop',
	function showsCustomSingleNoOptions() {
		assertNoOptions(false, 'this is custom no option message for single select');
	},
);

upstreamTest(
	'noOptionsMessage() function prop multi select > should show NoOptionsMessage returned from noOptionsMessage function prop',
	function showsCustomMultiNoOptions() {
		assertNoOptions(true, 'this is custom no option message for multi select');
	},
);

function assertUpdatedValue(
	isMulti: boolean,
	options: readonly unknown[],
	initial: unknown,
	updated: unknown,
	initialValue: string,
	updatedValue: string,
	delimiter?: string,
): void {
	const result = renderSelect({ delimiter, isMulti, options, value: initial });
	expect(hiddenInput(result.container).value).toBe(initialValue);
	result.rerender({ props: basicProps({ delimiter, isMulti, options, value: updated }) });
	expect(hiddenInput(result.container).value).toBe(updatedValue);
}

upstreamTest(
	'update the value prop single select > should update the value when prop is updated',
	function updatesSingleValue() {
		assertUpdatedValue(false, OPTIONS, OPTIONS[1], OPTIONS[3], 'one', 'three');
	},
);

upstreamTest(
	'update the value prop single select > value of options is number > should update the value when prop is updated',
	function updatesNumericSingleValue() {
		assertUpdatedValue(false, NUMBER_OPTIONS, NUMBER_OPTIONS[2], NUMBER_OPTIONS[3], '2', '3');
	},
);

upstreamTest(
	'update the value prop multi select > should update the value when prop is updated',
	function updatesMultiValue() {
		assertUpdatedValue(true, OPTIONS, OPTIONS[1], OPTIONS[3], 'one', 'three');
	},
);

upstreamTest(
	'update the value prop multi select > value of options is number > should update the value when prop is updated',
	function updatesNumericMultiValue() {
		assertUpdatedValue(
			true,
			NUMBER_OPTIONS,
			NUMBER_OPTIONS[2],
			[NUMBER_OPTIONS[3], NUMBER_OPTIONS[2]],
			'2',
			'3,2',
			',',
		);
	},
);

function assertAutoFocus(isMulti: boolean): void {
	const result = renderSelect({ autoFocus: true, isMulti });
	expect(inputFor(result.container)).toBe(document.activeElement);
}

upstreamTest(
	'autoFocus single select > should focus select on mount',
	function focusesSingleSelect() {
		assertAutoFocus(false);
	},
);

upstreamTest(
	'autoFocus multi select > should focus select on mount',
	function focusesMultiSelect() {
		assertAutoFocus(true);
	},
);

function assertAutoFocusCallback(isMulti: boolean): void {
	const onFocus = vi.fn();
	const result = renderSelect({ autoFocus: true, isMulti, onFocus });
	expect(inputFor(result.container)).toBe(document.activeElement);
	expect(onFocus).toHaveBeenCalledTimes(1);
}

upstreamTest(
	'onFocus prop with autoFocus single select > should call auto focus only once when select is autoFocus',
	function callsSingleAutoFocus() {
		assertAutoFocusCallback(false);
	},
);

upstreamTest(
	'onFocus prop with autoFocus multi select > should call auto focus only once when select is autoFocus',
	function callsMultiAutoFocus() {
		assertAutoFocusCallback(true);
	},
);

function assertFocusCallback(isMulti: boolean): void {
	const onFocus = vi.fn();
	const result = renderSelect({ isMulti, onFocus });
	fireEvent.focus(inputFor(result.container));
	expect(onFocus).toHaveBeenCalledTimes(1);
}

upstreamTest(
	'onFocus prop is called on on focus of input single select > should call onFocus handler on focus on input',
	function callsSingleFocus() {
		assertFocusCallback(false);
	},
);

upstreamTest(
	'onFocus prop is called on on focus of input multi select > should call onFocus handler on focus on input',
	function callsMultiFocus() {
		assertFocusCallback(true);
	},
);

function assertBlurCallback(isMulti: boolean): void {
	const onBlur = vi.fn();
	const result = renderSelect({ isMulti, onBlur });
	fireEvent.blur(inputFor(result.container));
	expect(onBlur).toHaveBeenCalledTimes(1);
}

upstreamTest(
	'onBlur prop single select > should call onBlur handler on blur on input',
	function callsSingleBlur() {
		assertBlurCallback(false);
	},
);

upstreamTest(
	'onBlur prop multi select > should call onBlur handler on blur on input',
	function callsMultiBlur() {
		assertBlurCallback(true);
	},
);

upstreamTest(
	'onInputChange() function prop to be called on blur',
	function callsInputChangeOnBlur() {
		const onInputChange = vi.fn();
		const result = renderSelect({ onInputChange });
		fireEvent.blur(inputFor(result.container));
		expect(onInputChange).toHaveBeenCalledTimes(2);
	},
);

upstreamTest('onMenuClose() function prop to be called on blur', function callsMenuCloseOnBlur() {
	const onMenuClose = vi.fn();
	const result = renderSelect({ onMenuClose });
	fireEvent.blur(inputFor(result.container));
	expect(onMenuClose).toHaveBeenCalledTimes(1);
});

function assertPlaceholder(isMulti: boolean, placeholder?: unknown): void {
	const result =
		placeholder === undefined ? renderSelect({ isMulti }) : renderSelect({ isMulti, placeholder });
	expect(result.container.querySelector('.react-select__control')?.textContent).toBe(
		placeholder === undefined ? 'Select...' : 'single Select...',
	);
}

upstreamTest(
	'placeholder single select > should display default placeholder "Select..."',
	function showsSingleDefaultPlaceholder() {
		assertPlaceholder(false);
	},
);

upstreamTest(
	'placeholder single select > should display provided string placeholder',
	function showsSingleStringPlaceholder() {
		assertPlaceholder(false, 'single Select...');
	},
);

upstreamTest(
	'placeholder single select > should display provided node placeholder',
	function showsSingleNodePlaceholder() {
		assertPlaceholder(false, createElement('span', null, 'single Select...'));
	},
);

upstreamTest(
	'placeholder multi select > should display default placeholder "Select..."',
	function showsMultiDefaultPlaceholder() {
		assertPlaceholder(true);
	},
);

upstreamTest(
	'placeholder multi select > should display provided placeholder',
	function showsMultiPlaceholder() {
		const result = renderSelect({ isMulti: true, placeholder: 'multi Select...' });
		expect(result.container.querySelector('.react-select__control')?.textContent).toBe(
			'multi Select...',
		);
	},
);

function assertPlaceholderAfterRemoval(isMulti: boolean): void {
	const result = renderSelect({ isMulti, value: OPTIONS[0] });
	expect(result.container.querySelector('.react-select__placeholder')).toBeNull();
	result.rerender({ props: basicProps({ isMulti, value: null }) });
	expect(result.container.querySelector('.react-select__placeholder')).toBeTruthy();
}

upstreamTest(
	'display placeholder once value is removed single select > should display placeholder once the value is removed from select',
	function showsSinglePlaceholderAfterRemoval() {
		assertPlaceholderAfterRemoval(false);
	},
);

upstreamTest(
	'display placeholder once value is removed multi select > should display placeholder once the value is removed from select',
	function showsMultiPlaceholderAfterRemoval() {
		assertPlaceholderAfterRemoval(true);
	},
);

upstreamTest('sets inputMode="none" when isSearchable is false', function setsNonSearchInputMode() {
	const result = renderSelect({ isSearchable: false });
	const input = result.container.querySelector<HTMLInputElement>(
		'.react-select__value-container input',
	);
	if (!input) throw new Error('Expected dummy input');
	expect(input.inputMode).toBe('none');
	expect(window.getComputedStyle(input).caretColor).toBe('rgba(0, 0, 0, 0)');
});

function assertDisabledClick(isMulti: boolean): void {
	const onChange = vi.fn();
	const options = [
		{ label: 'option 1', value: 'opt1' },
		{ label: 'option 2', value: 'opt2', isDisabled: true },
	];
	const result = renderSelect({ isMulti, menuIsOpen: true, onChange, options });
	const disabled = Array.from(
		result.container.querySelectorAll<HTMLElement>('.react-select__option'),
	).find(function findDisabled(option) {
		return option.textContent === 'option 2';
	});
	if (!disabled) throw new Error('Expected disabled option');
	fireEvent.click(disabled);
	expect(onChange).not.toHaveBeenCalled();
}

upstreamTest(
	'clicking on disabled option single select > should not select the disabled option',
	function ignoresSingleDisabledClick() {
		assertDisabledClick(false);
	},
);

upstreamTest(
	'clicking on disabled option multi select > should not select the disabled option',
	function ignoresMultiDisabledClick() {
		assertDisabledClick(true);
	},
);

function assertNotClearable(isMulti: boolean): void {
	const result = renderSelect({ isClearable: false, isMulti, value: [OPTIONS[0]] });
	expect(result.container.querySelector('.react-select__clear-indicator')).toBeNull();
}

upstreamTest(
	'isClearable is false single select > should not show the X (clear) button',
	function hidesSingleClearButton() {
		assertNotClearable(false);
	},
);

upstreamTest('isClearable is false test-input-name', function hidesMultiClearButton() {
	assertNotClearable(true);
});

upstreamTest('getOptionLabel() prop > to format the option label', function formatsOptionLabel() {
	function getOptionLabel(option: Option): string {
		return `This a custom option ${option.label} label`;
	}
	const result = renderSelect({ getOptionLabel, menuIsOpen: true });
	expect(optionTexts(result.container)[0]).toBe('This a custom option 0 label');
});

interface GroupOption {
	readonly value: number;
	readonly label: string;
}

interface OptionGroup {
	readonly label: string;
	readonly options: readonly GroupOption[];
}

const GROUPS: readonly OptionGroup[] = [
	{
		label: 'group 1',
		options: [
			{ value: 1, label: '1' },
			{ value: 2, label: '2' },
		],
	},
	{
		label: 'group 2',
		options: [
			{ value: 3, label: '3' },
			{ value: 4, label: '4' },
		],
	},
];

upstreamTest(
	'formatGroupLabel function prop > to format Group label',
	function formatsGroupLabel() {
		function formatGroupLabel(group: OptionGroup): string {
			return `This is custom ${group.label} header`;
		}
		const result = renderSelect({ formatGroupLabel, menuIsOpen: true, options: GROUPS });
		expect(result.container.querySelector('.react-select__group-heading')?.textContent).toBe(
			'This is custom group 1 header',
		);
	},
);

upstreamTest(
	'to only render groups with at least one match when filtering',
	function filtersEmptyGroups() {
		const result = renderSelect({ inputValue: '1', menuIsOpen: true, options: GROUPS });
		const groups = result.container.querySelectorAll('.react-select__group');
		expect(groups).toHaveLength(1);
		expect(groups[0].querySelectorAll('.react-select__option')).toHaveLength(1);
	},
);

upstreamTest(
	'not render any groups when there is not a single match when filtering',
	function omitsAllEmptyGroups() {
		const result = renderSelect({ inputValue: '5', menuIsOpen: true, options: GROUPS });
		expect(result.container.querySelectorAll('.react-select__group')).toHaveLength(0);
	},
);

upstreamTest(
	'multi select > have default value delimiter seperated',
	function joinsDefaultDelimiter() {
		const result = renderSelect({
			delimiter: ';',
			isMulti: true,
			value: [OPTIONS[0], OPTIONS[1]],
		});
		expect(hiddenInput(result.container).value).toBe('zero;one');
	},
);

upstreamTest('multi select > with multi character delimiter', function joinsMultiDelimiter() {
	const result = renderSelect({
		delimiter: '===&===',
		isMulti: true,
		value: [OPTIONS[0], OPTIONS[1]],
	});
	expect(hiddenInput(result.container).value).toBe('zero===&===one');
});

upstreamTest(
	'multi select > removes the selected option from the menu options when isSearchable is false',
	function removesSelectedMenuOption() {
		const result = renderSelect({
			delimiter: ',',
			isMulti: true,
			isSearchable: false,
			menuIsOpen: true,
		});
		expect(optionTexts(result.container)).toHaveLength(17);
		result.rerender({
			props: basicProps({
				delimiter: ',',
				isMulti: true,
				isSearchable: false,
				menuIsOpen: true,
				value: OPTIONS[0],
			}),
		});
		expect(optionTexts(result.container)).toHaveLength(16);
		expect(optionTexts(result.container)).not.toContain('0');
	},
);

upstreamTest(
	'hitting ArrowUp key on closed select should focus last element',
	function focusesLastOption() {
		const result = renderSelect({ menuIsOpen: true });
		const control = result.container.querySelector<HTMLElement>('.react-select__control');
		if (!control) throw new Error('Expected select control');
		fireEvent.keyDown(control, { keyCode: 38, key: 'ArrowUp' });
		expect(result.container.querySelector('.react-select__option--is-focused')?.textContent).toBe(
			'16',
		);
	},
);

function assertEscapeDoesNotClear(escapeClearsValue: boolean, isClearable: boolean): void {
	const onChange = vi.fn();
	const result = renderSelect({
		escapeClearsValue,
		isClearable,
		onChange,
		value: OPTIONS[0],
	});
	const root = result.container.querySelector<HTMLElement>('.react-select');
	if (!root) throw new Error('Expected select root');
	fireEvent.keyDown(root, { keyCode: 27, key: 'Escape' });
	expect(onChange).not.toHaveBeenCalled();
}

upstreamTest(
	'to not clear value when hitting escape if escapeClearsValue is false (default) and isClearable is false',
	function keepsNonClearableDefaultEscape() {
		assertEscapeDoesNotClear(false, false);
	},
);

upstreamTest(
	'to not clear value when hitting escape if escapeClearsValue is false (default) and isClearable is true',
	function keepsClearableDefaultEscape() {
		assertEscapeDoesNotClear(false, true);
	},
);

upstreamTest(
	'to not clear value when hitting escape if escapeClearsValue is true and isClearable is false',
	function keepsNonClearableEscapeValue() {
		assertEscapeDoesNotClear(true, false);
	},
);

upstreamTest(
	'hitting spacebar should not select option if isSearchable is true (default)',
	function ignoresSearchableSpace() {
		const onChange = vi.fn();
		const result = renderSelect({ menuIsOpen: true, onChange });
		fireEvent.keyDown(result.container, { keyCode: 32, key: ' ' });
		expect(onChange).not.toHaveBeenCalled();
	},
);

function optionWithText(container: HTMLElement, label: string): HTMLElement {
	const option = Array.from(container.querySelectorAll<HTMLElement>('.react-select__option')).find(
		function matchesLabel(candidate) {
			return candidate.textContent === label;
		},
	);
	if (!option) throw new Error(`Expected option ${label}`);
	return option;
}

function assertSelectedOption(
	isMulti: boolean,
	options: readonly unknown[],
	label: string,
	expectedOption: unknown,
): void {
	const onChange = vi.fn();
	const result = renderSelect({ isMulti, menuIsOpen: true, onChange, options });
	fireEvent.click(optionWithText(result.container, label));
	expect(onChange).toHaveBeenCalledWith(isMulti ? [expectedOption] : expectedOption, {
		action: 'select-option',
		name: 'test-input-name',
		...(isMulti ? { option: expectedOption } : {}),
	});
}

upstreamTest(
	'calls onChange on selecting an option single select > option is clicked > should call onChange() prop with selected option',
	function selectsClickedSingleOption() {
		assertSelectedOption(false, OPTIONS, '2', OPTIONS[2]);
	},
);

upstreamTest(
	'calls onChange on selecting an option single select > option with number value > option is clicked > should call onChange() prop with selected option',
	function selectsClickedNumberOption() {
		assertSelectedOption(false, NUMBER_OPTIONS, '0', NUMBER_OPTIONS[0]);
	},
);

upstreamTest(
	'calls onChange on selecting an option single select > option with boolean value > option is clicked > should call onChange() prop with selected option',
	function selectsClickedBooleanOption() {
		assertSelectedOption(false, BOOLEAN_OPTIONS, 'true', BOOLEAN_OPTIONS[0]);
	},
);

upstreamTest(
	'calls onChange on selecting an option multi select > option is clicked > should call onChange() prop with selected option',
	function selectsClickedMultiOption() {
		assertSelectedOption(true, OPTIONS, '2', OPTIONS[2]);
	},
);

upstreamTest(
	'calls onChange on selecting an option multi select > option with number value > option is clicked > should call onChange() prop with selected option',
	function selectsClickedMultiNumberOption() {
		assertSelectedOption(true, NUMBER_OPTIONS, '0', NUMBER_OPTIONS[0]);
	},
);

upstreamTest(
	'calls onChange on selecting an option multi select > option with boolean value > option is clicked > should call onChange() prop with selected option',
	function selectsClickedMultiBooleanOption() {
		assertSelectedOption(true, BOOLEAN_OPTIONS, 'true', BOOLEAN_OPTIONS[0]);
	},
);

function assertDeselectedOption(options: readonly unknown[], label: string, value: unknown): void {
	const onChange = vi.fn();
	const result = renderSelect({
		hideSelectedOptions: false,
		isMulti: true,
		menuIsOpen: true,
		onChange,
		options,
		value: [value],
	});
	fireEvent.click(optionWithText(result.container, label));
	expect(onChange).toHaveBeenCalledWith([], {
		action: 'deselect-option',
		name: 'test-input-name',
		option: value,
	});
}

upstreamTest(
	'calls onChange on de-selecting an option in multi select option is clicked > should call onChange() prop with correct selected options and meta',
	function deselectsClickedOption() {
		assertDeselectedOption(OPTIONS, '2', OPTIONS[2]);
	},
);

upstreamTest(
	'calls onChange on de-selecting an option in multi select option with number value > option is clicked > should call onChange() prop with selected option',
	function deselectsClickedNumberOption() {
		assertDeselectedOption(NUMBER_OPTIONS, '0', NUMBER_OPTIONS[0]);
	},
);

upstreamTest(
	'calls onChange on de-selecting an option in multi select option with boolean value > option is clicked > should call onChange() prop with selected option',
	function deselectsClickedBooleanOption() {
		assertDeselectedOption(BOOLEAN_OPTIONS, 'true', BOOLEAN_OPTIONS[0]);
	},
);

function assertMenuIndicator(isMulti: boolean, menuIsOpen: boolean): void {
	const callback = vi.fn();
	const callbackProps = menuIsOpen ? { onMenuClose: callback } : { onMenuOpen: callback };
	const result = renderSelect({ ...callbackProps, isMulti, menuIsOpen });
	const indicator = result.container.querySelector<HTMLElement>(
		'.react-select__dropdown-indicator',
	);
	if (!indicator) throw new Error('Expected dropdown indicator');
	fireEvent.mouseDown(indicator, { button: 0 });
	expect(callback).toHaveBeenCalled();
}

upstreamTest(
	'Clicking dropdown indicator on select with closed menu with primary button on mouse single select > should call onMenuOpen prop when select is opened and onMenuClose prop when select is closed',
	function opensSingleMenuFromIndicator() {
		assertMenuIndicator(false, false);
	},
);

upstreamTest(
	'Clicking dropdown indicator on select with closed menu with primary button on mouse multi select > should call onMenuOpen prop when select is opened and onMenuClose prop when select is closed',
	function opensMultiMenuFromIndicator() {
		assertMenuIndicator(true, false);
	},
);

upstreamTest(
	'Clicking dropdown indicator on select with open menu with primary button on mouse single select > should call onMenuOpen prop when select is opened and onMenuClose prop when select is closed',
	function closesSingleMenuFromIndicator() {
		assertMenuIndicator(false, true);
	},
);

upstreamTest(
	'Clicking dropdown indicator on select with open menu with primary button on mouse multi select > should call onMenuOpen prop when select is opened and onMenuClose prop when select is closed',
	function closesMultiMenuFromIndicator() {
		assertMenuIndicator(true, true);
	},
);

function assertHiddenValue(
	isMulti: boolean,
	options: readonly unknown[],
	value: unknown,
	expected: string,
	delimiter?: string,
): void {
	const result = renderSelect({ delimiter, isMulti, options, value });
	expect(hiddenInput(result.container).value).toBe(expected);
}

upstreamTest(
	'value of hidden input control single select > should set value of input as value prop',
	function serializesSingleStringValue() {
		assertHiddenValue(false, OPTIONS, OPTIONS[3], 'three');
	},
);

upstreamTest(
	'value of hidden input control single select > options with number values > should set value of input as value prop',
	function serializesSingleNumberValue() {
		assertHiddenValue(false, NUMBER_OPTIONS, NUMBER_OPTIONS[3], '3');
	},
);

upstreamTest(
	'value of hidden input control single select > options with boolean values > should set value of input as value prop',
	function serializesSingleBooleanValue() {
		assertHiddenValue(false, BOOLEAN_OPTIONS, BOOLEAN_OPTIONS[1], 'false');
	},
);

upstreamTest(
	'value of hidden input control multi select > should set value of input as value prop',
	function serializesMultiStringValue() {
		assertHiddenValue(true, OPTIONS, OPTIONS[3], 'three');
	},
);

upstreamTest(
	'value of hidden input control multi select > with delimiter prop > should set value of input as value prop',
	function serializesDelimitedStringValues() {
		assertHiddenValue(true, OPTIONS, [OPTIONS[3], OPTIONS[5]], 'three, five', ', ');
	},
);

upstreamTest(
	'value of hidden input control multi select > options with number values > should set value of input as value prop',
	function serializesMultiNumberValue() {
		assertHiddenValue(true, NUMBER_OPTIONS, NUMBER_OPTIONS[3], '3');
	},
);

upstreamTest(
	'value of hidden input control multi select > with delimiter prop > options with number values > should set value of input as value prop',
	function serializesDelimitedNumberValues() {
		assertHiddenValue(true, NUMBER_OPTIONS, [NUMBER_OPTIONS[3], NUMBER_OPTIONS[1]], '3, 1', ', ');
	},
);

upstreamTest(
	'value of hidden input control multi select > options with boolean values > should set value of input as value prop',
	function serializesMultiBooleanValue() {
		assertHiddenValue(true, BOOLEAN_OPTIONS, BOOLEAN_OPTIONS[1], 'false');
	},
);

upstreamTest(
	'value of hidden input control multi select > with delimiter prop > options with boolean values > should set value of input as value prop',
	function serializesDelimitedBooleanValues() {
		assertHiddenValue(
			true,
			BOOLEAN_OPTIONS,
			[BOOLEAN_OPTIONS[1], BOOLEAN_OPTIONS[0]],
			'false, true',
			', ',
		);
	},
);

function isOptionDisabled(option: Option): boolean {
	return ['zero', 'two', 'five', 'ten'].includes(option.value);
}

function assertDisabledOptions(isMulti: boolean): void {
	const result = renderSelect({ isMulti, isOptionDisabled, menuIsOpen: true });
	const disabled = Array.from(
		result.container.querySelectorAll<HTMLElement>('.react-select__option--is-disabled'),
		function optionText(option) {
			return option.textContent;
		},
	);
	expect(disabled).toContain('0');
	expect(disabled).toContain('2');
	expect(disabled).toContain('5');
	expect(disabled).toContain('10');
	expect(disabled).not.toContain('1');
}

upstreamTest(
	'isOptionDisabled() prop single select > should add isDisabled as true prop only to options that are disabled',
	function marksSingleDisabledOptions() {
		assertDisabledOptions(false);
	},
);

upstreamTest(
	'isOptionDisabled() prop multi select > should add isDisabled as true prop only to options that are disabled',
	function marksMultiDisabledOptions() {
		assertDisabledOptions(true);
	},
);

function assertDisabledSelect(isMulti: boolean): void {
	const result = renderSelect({ isDisabled: true, isMulti });
	expect(result.container.querySelector('.react-select__control')?.classList).toContain(
		'react-select__control--is-disabled',
	);
	const input = result.container.querySelector<HTMLInputElement>('.react-select__control input');
	expect(input?.disabled).toBe(true);
}

upstreamTest(
	'isDisabled prop single select > should add isDisabled prop to select components',
	function disablesSingleSelect() {
		assertDisabledSelect(false);
	},
);

upstreamTest(
	'isDisabled prop multi select > should add isDisabled prop to select components',
	function disablesMultiSelect() {
		assertDisabledSelect(true);
	},
);

upstreamTest(
	'multi select > to not show selected value in options',
	function hidesSelectedMultiValue() {
		const result = renderSelect({ isMulti: true, menuIsOpen: true });
		expect(optionTexts(result.container)).toContain('0');
		result.rerender({
			props: basicProps({ isMulti: true, menuIsOpen: true, value: OPTIONS[0] }),
		});
		expect(optionTexts(result.container)).not.toContain('0');
	},
);

upstreamTest(
	'multi select > to not hide the selected options from the menu if hideSelectedOptions is false',
	function showsSelectedMultiValue() {
		const result = renderSelect({
			hideSelectedOptions: false,
			isMulti: true,
			menuIsOpen: true,
			value: OPTIONS[0],
		});
		expect(optionTexts(result.container)).toContain('0');
	},
);

function selectControl(container: HTMLElement): HTMLElement {
	const control = container.querySelector<HTMLElement>('.react-select__control');
	if (!control) throw new Error('Expected select control');
	return control;
}

upstreamTest(
	'multi select > call onChange with all values but last selected value and remove event on hitting backspace',
	function popsLastMultiValue() {
		const onChange = vi.fn();
		const result = renderSelect({
			isMulti: true,
			onChange,
			value: [OPTIONS[0], OPTIONS[1], OPTIONS[2]],
		});
		fireEvent.keyDown(selectControl(result.container), { keyCode: 8, key: 'Backspace' });
		expect(onChange).toHaveBeenCalledWith([OPTIONS[0], OPTIONS[1]], {
			action: 'pop-value',
			name: 'test-input-name',
			removedValue: OPTIONS[2],
		});
	},
);

upstreamTest(
	'should not call onChange on hitting backspace when backspaceRemovesValue is false',
	function ignoresDisabledBackspaceRemoval() {
		const onChange = vi.fn();
		const result = renderSelect({ backspaceRemovesValue: false, onChange });
		fireEvent.keyDown(selectControl(result.container), { keyCode: 8, key: 'Backspace' });
		expect(onChange).not.toHaveBeenCalled();
	},
);

upstreamTest(
	'should not call onChange on hitting backspace even when backspaceRemovesValue is true if isClearable is false',
	function ignoresNonClearableBackspace() {
		const onChange = vi.fn();
		const result = renderSelect({ backspaceRemovesValue: true, isClearable: false, onChange });
		fireEvent.keyDown(selectControl(result.container), { keyCode: 8, key: 'Backspace' });
		expect(onChange).not.toHaveBeenCalled();
	},
);

upstreamTest(
	'should call onChange with `null` on hitting backspace when backspaceRemovesValue is true and isMulti is false',
	function clearsEmptySingleValueOnBackspace() {
		const onChange = vi.fn();
		const result = renderSelect({
			backspaceRemovesValue: true,
			isClearable: true,
			isMulti: false,
			onChange,
		});
		fireEvent.keyDown(selectControl(result.container), { keyCode: 8, key: 'Backspace' });
		expect(onChange).toHaveBeenCalledWith(null, {
			action: 'clear',
			name: 'test-input-name',
			removedValues: [],
		});
	},
);

upstreamTest(
	'should call onChange with an array on hitting backspace when backspaceRemovesValue is true and isMulti is true',
	function popsMultiValueOnBackspace() {
		const onChange = vi.fn();
		const result = renderSelect({
			backspaceRemovesValue: true,
			isClearable: true,
			isMulti: true,
			onChange,
			value: [OPTIONS[0]],
		});
		fireEvent.keyDown(selectControl(result.container), { keyCode: 8, key: 'Backspace' });
		expect(onChange).toHaveBeenCalledWith([], {
			action: 'pop-value',
			name: 'test-input-name',
			removedValue: OPTIONS[0],
		});
	},
);

upstreamTest(
	'should call not call onChange on hitting backspace when backspaceRemovesValue is true and isMulti is true and there are no values',
	function ignoresEmptyMultiBackspace() {
		const onChange = vi.fn();
		const result = renderSelect({
			backspaceRemovesValue: true,
			isClearable: true,
			isMulti: true,
			onChange,
		});
		fireEvent.keyDown(selectControl(result.container), { keyCode: 8, key: 'Backspace' });
		expect(onChange).not.toHaveBeenCalled();
	},
);

function activeDescendant(container: HTMLElement): string | null {
	return inputFor(container).getAttribute('aria-activedescendant');
}

function selectMenu(container: HTMLElement): Element {
	const selectMenu = menu(container);
	if (!selectMenu) throw new Error('Expected select menu');
	return selectMenu;
}

function assertBasicActiveDescendant(isMulti: boolean): void {
	const renderProps = {
		instanceId: 1000,
		value: OPTIONS[2],
		menuIsOpen: true,
		hideSelectedOptions: false,
		isMulti,
	};
	const result = renderSelect(renderProps);

	expect(activeDescendant(result.container)).toBe('react-select-1000-option-2');
	fireEvent.keyDown(selectMenu(result.container), { keyCode: 40, key: 'ArrowDown' });
	expect(activeDescendant(result.container)).toBe('react-select-1000-option-3');
	fireEvent.keyDown(selectMenu(result.container), { keyCode: 38, key: 'ArrowUp' });
	expect(activeDescendant(result.container)).toBe('react-select-1000-option-2');
	fireEvent.keyDown(selectMenu(result.container), { keyCode: 36, key: 'Home' });
	expect(activeDescendant(result.container)).toBe('react-select-1000-option-0');
	fireEvent.keyDown(selectMenu(result.container), { keyCode: 35, key: 'End' });
	expect(activeDescendant(result.container)).toBe('react-select-1000-option-16');

	result.rerender({ props: basicProps({ ...renderProps, menuIsOpen: false }) });
	expect(activeDescendant(result.container)).toBe('');

	result.rerender({ props: basicProps({ ...renderProps, autoFocus: true, inputValue: 'four' }) });
	expect(activeDescendant(result.container)).toBe('react-select-1000-option-4');
	result.rerender({ props: basicProps({ ...renderProps, autoFocus: true, inputValue: 'fourt' }) });
	expect(activeDescendant(result.container)).toBe('react-select-1000-option-14');
	result.rerender({ props: basicProps({ ...renderProps, autoFocus: true, inputValue: 'fourt1' }) });
	expect(activeDescendant(result.container)).toBe('');
}

upstreamTest(
	'accessibility > aria-activedescendant for basic options test-input-name',
	function tracksSingleBasicOption() {
		assertBasicActiveDescendant(false);
	},
);

upstreamTest(
	'accessibility > aria-activedescendant for basic options test-input-name',
	function tracksMultiBasicOption() {
		assertBasicActiveDescendant(true);
	},
);

function assertGroupedActiveDescendant(isMulti: boolean): void {
	const renderProps = {
		instanceId: 1000,
		options: GROUPED_OPTIONS,
		value: GROUPED_OPTIONS[0].options[2],
		menuIsOpen: true,
		hideSelectedOptions: false,
		isMulti,
	};
	const result = renderSelect(renderProps);

	expect(activeDescendant(result.container)).toBe('react-select-1000-option-0-2');
	fireEvent.keyDown(selectMenu(result.container), { keyCode: 40, key: 'ArrowDown' });
	expect(activeDescendant(result.container)).toBe('react-select-1000-option-0-3');
	fireEvent.keyDown(selectMenu(result.container), { keyCode: 38, key: 'ArrowUp' });
	expect(activeDescendant(result.container)).toBe('react-select-1000-option-0-2');
	fireEvent.keyDown(selectMenu(result.container), { keyCode: 36, key: 'Home' });
	expect(activeDescendant(result.container)).toBe('react-select-1000-option-0-0');
	fireEvent.keyDown(selectMenu(result.container), { keyCode: 35, key: 'End' });
	expect(activeDescendant(result.container)).toBe('react-select-1000-option-1-1');

	result.rerender({ props: basicProps({ ...renderProps, menuIsOpen: false }) });
	expect(activeDescendant(result.container)).toBe('');

	result.rerender({ props: basicProps({ ...renderProps, autoFocus: true, inputValue: '1' }) });
	expect(activeDescendant(result.container)).toBe('react-select-1000-option-0-1');
	result.rerender({ props: basicProps({ ...renderProps, autoFocus: true, inputValue: '10' }) });
	expect(activeDescendant(result.container)).toBe('react-select-1000-option-0-10');
	result.rerender({ props: basicProps({ ...renderProps, autoFocus: true, inputValue: '102' }) });
	expect(activeDescendant(result.container)).toBe('');
}

upstreamTest(
	'accessibility > aria-activedescendant for grouped options test-input-name',
	function tracksSingleGroupedOption() {
		assertGroupedActiveDescendant(false);
	},
);

upstreamTest(
	'accessibility > aria-activedescendant for grouped options test-input-name',
	function tracksMultiGroupedOption() {
		assertGroupedActiveDescendant(true);
	},
);

upstreamTest(
	'accessibility > aria-activedescendant should not exist if hideSelectedOptions=true',
	function omitsHiddenSelectedActiveDescendant() {
		const result = renderSelect({
			instanceId: '1000',
			value: OPTIONS[2],
			isMulti: true,
			menuIsOpen: true,
		});
		expect(activeDescendant(result.container)).toBe('');
	},
);

function assertAriaAttribute(
	isMulti: boolean,
	name: string,
	value: string | boolean,
	expected: string,
): void {
	const result = renderSelect({ [name]: value, isMulti });
	expect(inputFor(result.container).getAttribute(name)).toBe(expected);
}

upstreamTest(
	'accessibility > passes through aria-labelledby prop single select > should pass aria-labelledby prop down to input',
	function labelsSingleInput() {
		assertAriaAttribute(false, 'aria-labelledby', 'testing', 'testing');
	},
);

upstreamTest(
	'accessibility > passes through aria-labelledby prop multi select > should pass aria-labelledby prop down to input',
	function labelsMultiInput() {
		assertAriaAttribute(true, 'aria-labelledby', 'testing', 'testing');
	},
);

upstreamTest(
	'accessibility > passes through aria-errormessage prop single select > should pass aria-errormessage prop down to input',
	function describesSingleInputError() {
		assertAriaAttribute(false, 'aria-errormessage', 'error-message', 'error-message');
	},
);

upstreamTest(
	'accessibility > passes through aria-errormessage prop multi select > should pass aria-errormessage prop down to input',
	function describesMultiInputError() {
		assertAriaAttribute(true, 'aria-errormessage', 'error-message', 'error-message');
	},
);

upstreamTest(
	'accessibility > passes through aria-invalid prop single select > should pass aria-invalid prop down to input',
	function invalidatesSingleInput() {
		assertAriaAttribute(false, 'aria-invalid', true, 'true');
	},
);

upstreamTest(
	'accessibility > passes through aria-invalid prop multi select > should pass aria-invalid prop down to input',
	function invalidatesMultiInput() {
		assertAriaAttribute(true, 'aria-invalid', true, 'true');
	},
);

upstreamTest(
	'accessibility > passes through aria-label prop single select > should pass aria-labelledby prop down to input',
	function ariaLabelsSingleInput() {
		assertAriaAttribute(false, 'aria-label', 'testing', 'testing');
	},
);

upstreamTest(
	'accessibility > passes through aria-label prop multi select > should pass aria-labelledby prop down to input',
	function ariaLabelsMultiInput() {
		assertAriaAttribute(true, 'aria-label', 'testing', 'testing');
	},
);

upstreamTest(
	'closeMenuOnSelect prop > when passed as false it should not call onMenuClose on selecting option',
	function keepsMenuOpenOnSelect() {
		const onMenuClose = vi.fn();
		const result = renderSelect({
			blurInputOnSelect: false,
			closeMenuOnSelect: false,
			menuIsOpen: true,
			onMenuClose,
		});
		fireEvent.click(optionWithText(result.container, '0'));
		expect(onMenuClose).not.toHaveBeenCalled();
	},
);

interface NavigationCase {
	readonly event: { readonly key: string; readonly keyCode: number };
	readonly expectedIndex: number;
	readonly fullName: string;
	readonly isMulti: boolean;
	readonly pageSize?: number;
	readonly startIndex: number;
}

function focusedOption(container: HTMLElement): HTMLElement {
	const option = container.querySelector<HTMLElement>('.react-select__option--is-focused');
	if (!option) throw new Error('Expected focused option');
	return option;
}

function focusOptionAt(container: HTMLElement, index: number): void {
	const menuElement = menu(container);
	if (!menuElement) throw new Error('Expected select menu');
	fireEvent.keyDown(menuElement, { key: 'Home', keyCode: 36 });
	for (let current = 0; current < index; current += 1) {
		fireEvent.keyDown(menuElement, { key: 'ArrowDown', keyCode: 40 });
	}
	expect(focusedOption(container).textContent).toBe(OPTIONS[index].label);
}

function assertNavigation(testCase: NavigationCase): void {
	const result =
		testCase.pageSize === undefined
			? renderSelect({ isMulti: testCase.isMulti, menuIsOpen: true })
			: renderSelect({
					isMulti: testCase.isMulti,
					menuIsOpen: true,
					pageSize: testCase.pageSize,
				});
	focusOptionAt(result.container, testCase.startIndex);
	const menuElement = menu(result.container);
	if (!menuElement) throw new Error('Expected select menu');
	fireEvent.keyDown(menuElement, testCase.event);
	expect(focusedOption(result.container).textContent).toBe(OPTIONS[testCase.expectedIndex].label);
}

const NAVIGATION_CASES: readonly NavigationCase[] = [
	{
		fullName:
			'focus on options > keyboard interaction with Menu single select > ArrowDown key on first option should focus second option',
		isMulti: false,
		startIndex: 0,
		event: { keyCode: 40, key: 'ArrowDown' },
		expectedIndex: 1,
	},
	{
		fullName:
			'focus on options > keyboard interaction with Menu single select > ArrowDown key on last option should focus first option',
		isMulti: false,
		startIndex: 16,
		event: { keyCode: 40, key: 'ArrowDown' },
		expectedIndex: 0,
	},
	{
		fullName:
			'focus on options > keyboard interaction with Menu single select > ArrowUp key on first option should focus last option',
		isMulti: false,
		startIndex: 0,
		event: { keyCode: 38, key: 'ArrowUp' },
		expectedIndex: 16,
	},
	{
		fullName:
			'focus on options > keyboard interaction with Menu single select > ArrowUp key on last option should focus second last option',
		isMulti: false,
		startIndex: 16,
		event: { keyCode: 38, key: 'ArrowUp' },
		expectedIndex: 15,
	},
	{
		fullName:
			'focus on options > keyboard interaction with Menu single select > PageDown key takes us to next page with default page size of 5',
		isMulti: false,
		startIndex: 0,
		event: { keyCode: 34, key: 'PageDown' },
		expectedIndex: 5,
	},
	{
		fullName:
			'focus on options > keyboard interaction with Menu single select > PageDown key takes us to next page with custom pageSize 7',
		isMulti: false,
		pageSize: 7,
		startIndex: 0,
		event: { keyCode: 34, key: 'PageDown' },
		expectedIndex: 7,
	},
	{
		fullName:
			'focus on options > keyboard interaction with Menu single select > PageDown key takes to the last option is options below is less then page size',
		isMulti: false,
		startIndex: 14,
		event: { keyCode: 34, key: 'PageDown' },
		expectedIndex: 16,
	},
	{
		fullName:
			'focus on options > keyboard interaction with Menu single select > PageUp key takes us to previous page with default page size of 5',
		isMulti: false,
		startIndex: 6,
		event: { keyCode: 33, key: 'PageUp' },
		expectedIndex: 1,
	},
	{
		fullName:
			'focus on options > keyboard interaction with Menu single select > PageUp key takes us to previous page with custom pageSize of 7',
		isMulti: false,
		pageSize: 7,
		startIndex: 9,
		event: { keyCode: 33, key: 'PageUp' },
		expectedIndex: 2,
	},
	{
		fullName:
			'focus on options > keyboard interaction with Menu single select > PageUp key takes us to first option - (previous options < pageSize)',
		isMulti: false,
		startIndex: 1,
		event: { keyCode: 33, key: 'PageUp' },
		expectedIndex: 0,
	},
	{
		fullName:
			'focus on options > keyboard interaction with Menu single select > Home key takes up to the first option',
		isMulti: false,
		startIndex: 14,
		event: { keyCode: 36, key: 'Home' },
		expectedIndex: 0,
	},
	{
		fullName:
			'focus on options > keyboard interaction with Menu single select > End key takes down to the last option',
		isMulti: false,
		startIndex: 2,
		event: { keyCode: 35, key: 'End' },
		expectedIndex: 16,
	},
	{
		fullName:
			'focus on options > keyboard interaction with Menu multi select > ArrowDown key on first option should focus second option',
		isMulti: true,
		startIndex: 0,
		event: { keyCode: 40, key: 'ArrowDown' },
		expectedIndex: 1,
	},
	{
		fullName:
			'focus on options > keyboard interaction with Menu multi select > ArrowDown key on last option should focus first option',
		isMulti: true,
		startIndex: 16,
		event: { keyCode: 40, key: 'ArrowDown' },
		expectedIndex: 0,
	},
	{
		fullName:
			'focus on options > keyboard interaction with Menu multi select > ArrowUp key on first option should focus last option',
		isMulti: true,
		startIndex: 0,
		event: { keyCode: 38, key: 'ArrowUp' },
		expectedIndex: 16,
	},
	{
		fullName:
			'focus on options > keyboard interaction with Menu multi select > ArrowUp key on last option should focus second last option',
		isMulti: true,
		startIndex: 16,
		event: { keyCode: 38, key: 'ArrowUp' },
		expectedIndex: 15,
	},
	{
		fullName:
			'focus on options > keyboard interaction with Menu multi select > PageDown key takes us to next page with default page size of 5',
		isMulti: true,
		startIndex: 0,
		event: { keyCode: 34, key: 'PageDown' },
		expectedIndex: 5,
	},
	{
		fullName:
			'focus on options > keyboard interaction with Menu multi select > PageDown key takes us to next page with custom pageSize of 8',
		isMulti: true,
		pageSize: 8,
		startIndex: 0,
		event: { keyCode: 34, key: 'PageDown' },
		expectedIndex: 8,
	},
	{
		fullName:
			'focus on options > keyboard interaction with Menu multi select > PageDown key takes to the last option is options below is less then page size',
		isMulti: true,
		startIndex: 14,
		event: { keyCode: 34, key: 'PageDown' },
		expectedIndex: 16,
	},
	{
		fullName:
			'focus on options > keyboard interaction with Menu multi select > PageUp key takes us to previous page with default page size of 5',
		isMulti: true,
		startIndex: 6,
		event: { keyCode: 33, key: 'PageUp' },
		expectedIndex: 1,
	},
	{
		fullName:
			'focus on options > keyboard interaction with Menu multi select > PageUp key takes us to previous page with default page size of 9',
		isMulti: true,
		pageSize: 9,
		startIndex: 10,
		event: { keyCode: 33, key: 'PageUp' },
		expectedIndex: 1,
	},
	{
		fullName:
			'focus on options > keyboard interaction with Menu multi select > PageUp key takes us to first option - previous options < pageSize',
		isMulti: true,
		startIndex: 1,
		event: { keyCode: 33, key: 'PageUp' },
		expectedIndex: 0,
	},
	{
		fullName:
			'focus on options > keyboard interaction with Menu multi select > Home key takes up to the first option',
		isMulti: true,
		startIndex: 14,
		event: { keyCode: 36, key: 'Home' },
		expectedIndex: 0,
	},
	{
		fullName:
			'focus on options > keyboard interaction with Menu multi select > End key takes down to the last option',
		isMulti: true,
		startIndex: 2,
		event: { keyCode: 35, key: 'End' },
		expectedIndex: 16,
	},
];

for (const navigationCase of NAVIGATION_CASES) {
	upstreamTest(navigationCase.fullName, function navigatesOptions() {
		assertNavigation(navigationCase);
	});
}

interface KeyboardSelectionCase {
	readonly fullName: string;
	readonly index: number;
	readonly isMulti: boolean;
	readonly key: string;
	readonly keyCode: number;
}

function assertKeyboardSelection(testCase: KeyboardSelectionCase): void {
	const onChange = vi.fn();
	const result = renderSelect({ isMulti: testCase.isMulti, menuIsOpen: true, onChange });
	focusOptionAt(result.container, testCase.index);
	const selected = OPTIONS[testCase.index];
	fireEvent.keyDown(optionWithText(result.container, selected.label), {
		key: testCase.key,
		keyCode: testCase.keyCode,
	});
	expect(onChange).toHaveBeenCalledWith(testCase.isMulti ? [selected] : selected, {
		action: 'select-option',
		name: 'test-input-name',
		...(testCase.isMulti ? { option: selected } : {}),
	});
}

const KEYBOARD_SELECTION_CASES: readonly KeyboardSelectionCase[] = [
	{
		fullName:
			'calls onChange on selecting an option single select > tab key is pressed while focusing option > should call onChange() prop with selected option',
		isMulti: false,
		index: 1,
		keyCode: 9,
		key: 'Tab',
	},
	{
		fullName:
			'calls onChange on selecting an option single select > enter key is pressed while focusing option > should call onChange() prop with selected option',
		isMulti: false,
		index: 3,
		keyCode: 13,
		key: 'Enter',
	},
	{
		fullName:
			'calls onChange on selecting an option single select > space key is pressed while focusing option > should call onChange() prop with selected option',
		isMulti: false,
		index: 1,
		keyCode: 32,
		key: ' ',
	},
	{
		fullName:
			'calls onChange on selecting an option multi select > tab key is pressed while focusing option > should call onChange() prop with selected option',
		isMulti: true,
		index: 1,
		keyCode: 9,
		key: 'Tab',
	},
	{
		fullName:
			'calls onChange on selecting an option multi select > enter key is pressed while focusing option > should call onChange() prop with selected option',
		isMulti: true,
		index: 3,
		keyCode: 13,
		key: 'Enter',
	},
	{
		fullName:
			'calls onChange on selecting an option multi select > space key is pressed while focusing option > should call onChange() prop with selected option',
		isMulti: true,
		index: 1,
		keyCode: 32,
		key: ' ',
	},
];

for (const selectionCase of KEYBOARD_SELECTION_CASES) {
	upstreamTest(selectionCase.fullName, function selectsByKeyboard() {
		assertKeyboardSelection(selectionCase);
	});
}

function assertEscapeOption(isMulti: boolean): void {
	const onChange = vi.fn();
	const result = renderSelect({ isMulti, menuIsOpen: true, onChange });
	focusOptionAt(result.container, 1);
	fireEvent.keyDown(optionWithText(result.container, '1'), { key: 'Escape', keyCode: 27 });
	expect(onChange).not.toHaveBeenCalled();
}

upstreamTest(
	'hitting escape on select option single select > should not call onChange prop',
	function ignoresSingleOptionEscape() {
		assertEscapeOption(false);
	},
);

upstreamTest(
	'hitting escape on select option multi select > should not call onChange prop',
	function ignoresMultiOptionEscape() {
		assertEscapeOption(true);
	},
);

function assertInputEscape(isMulti: boolean): void {
	const onInputChange = vi.fn();
	const result = renderSelect({
		inputValue: 'test',
		isMulti,
		menuIsOpen: true,
		onInputChange,
		value: OPTIONS[0],
	});
	const root = result.container.querySelector<HTMLElement>('.react-select');
	if (!root) throw new Error('Expected select root');
	fireEvent.keyDown(root, { key: 'Escape', keyCode: 27 });
	expect(onInputChange).toHaveBeenCalledWith('', {
		action: 'menu-close',
		prevInputValue: 'test',
	});
}

upstreamTest(
	'hitting escape with inputValue in select single select > should call onInputChange prop with empty string as inputValue',
	function clearsSingleInputOnEscape() {
		assertInputEscape(false);
	},
);

upstreamTest(
	'hitting escape with inputValue in select multi select > should call onInputChange prop with empty string as inputValue',
	function clearsMultiInputOnEscape() {
		assertInputEscape(true);
	},
);

upstreamTest(
	'hitting Enter on option should not call onChange if the event comes from IME',
	function ignoresImeEnter() {
		const onChange = vi.fn();
		const result = renderSelect({ menuIsOpen: true, onChange, tabSelectsValue: false });
		focusOptionAt(result.container, 1);
		fireEvent.keyDown(optionWithText(result.container, '0'), { key: 'Enter', keyCode: 229 });
		expect(onChange).not.toHaveBeenCalled();
	},
);

upstreamTest(
	'hitting tab on option should not call onChange if tabSelectsValue is false',
	function ignoresDisabledTabSelection() {
		const onChange = vi.fn();
		const result = renderSelect({ menuIsOpen: true, onChange, tabSelectsValue: false });
		focusOptionAt(result.container, 1);
		fireEvent.keyDown(optionWithText(result.container, '0'), { key: 'Tab', keyCode: 9 });
		expect(onChange).not.toHaveBeenCalled();
	},
);

function assertRequiredInputAbsent(isMulti: boolean): void {
	const result = renderSelect({ isMulti });
	expect(inputFor(result.container).required).toBe(false);
}

upstreamTest(
	'required on input is not there by default single select > should not have required attribute',
	function omitsSingleRequiredInput() {
		assertRequiredInputAbsent(false);
	},
);

upstreamTest(
	'required on input is not there by default multi select > should not have required attribute',
	function omitsMultiRequiredInput() {
		assertRequiredInputAbsent(true);
	},
);

upstreamTest(
	'clicking when focused does not open select when openMenuOnClick=false',
	function ignoresInputClickWhenDisabled() {
		const onMenuOpen = vi.fn();
		const result = renderSelect({ onMenuOpen, openMenuOnClick: false });
		fireEvent.click(inputFor(result.container));
		expect(onMenuOpen).not.toHaveBeenCalled();
	},
);

upstreamTest(
	'clear select by clicking on clear button > should not call onMenuOpen',
	function clearsWithoutOpeningMenu() {
		const onChange = vi.fn();
		const result = renderSelect({ isMulti: true, onChange, value: [OPTIONS[0]] });
		const clear = result.container.querySelector<HTMLElement>('.react-select__clear-indicator');
		if (!clear) throw new Error('Expected clear indicator');
		fireEvent.mouseDown(clear, { button: 0 });
		expect(onChange).toHaveBeenCalledWith([], {
			action: 'clear',
			name: 'test-input-name',
			removedValues: [OPTIONS[0]],
		});
	},
);

upstreamTest(
	'clearing select using clear button to not call onMenuOpen or onMenuClose',
	function clearsWithoutMenuCallbacks() {
		const onMenuClose = vi.fn();
		const onMenuOpen = vi.fn();
		const result = renderSelect({
			isMulti: true,
			onMenuClose,
			onMenuOpen,
			value: [OPTIONS[0]],
		});
		const clear = result.container.querySelector<HTMLElement>('.react-select__clear-indicator');
		if (!clear) throw new Error('Expected clear indicator');
		fireEvent.mouseDown(clear, { button: 0 });
		expect(onMenuOpen).not.toHaveBeenCalled();
		expect(onMenuClose).not.toHaveBeenCalled();
	},
);

upstreamTest(
	'multi select > clicking on X next to option will call onChange with all options other that the clicked option',
	function removesClickedMultiValue() {
		const onChange = vi.fn();
		const result = renderSelect({
			isMulti: true,
			onChange,
			value: [OPTIONS[0], OPTIONS[2], OPTIONS[4]],
		});
		const value = Array.from(
			result.container.querySelectorAll<HTMLElement>('.react-select__multi-value'),
		).find(function matchesValue(candidate) {
			return candidate.textContent === '4';
		});
		const remove = value?.querySelector<HTMLElement>('.react-select__multi-value__remove');
		if (!remove) throw new Error('Expected multi-value remove button');
		fireEvent.click(remove);
		expect(onChange).toHaveBeenCalledWith([OPTIONS[0], OPTIONS[2]], {
			action: 'remove-value',
			name: 'test-input-name',
			removedValue: OPTIONS[4],
		});
	},
);

interface KeyboardDeselectionCase {
	readonly fullName: string;
	readonly index: number;
	readonly key: string;
	readonly keyCode: number;
}

function assertKeyboardDeselection(testCase: KeyboardDeselectionCase): void {
	const onChange = vi.fn();
	const selected = OPTIONS[testCase.index];
	const result = renderSelect({
		hideSelectedOptions: false,
		isMulti: true,
		menuIsOpen: true,
		onChange,
		value: [selected],
	});
	focusOptionAt(result.container, testCase.index);
	fireEvent.keyDown(optionWithText(result.container, selected.label), {
		key: testCase.key,
		keyCode: testCase.keyCode,
	});
	expect(onChange).toHaveBeenCalledWith([], {
		action: 'deselect-option',
		name: 'test-input-name',
		option: selected,
	});
}

const KEYBOARD_DESELECTION_CASES: readonly KeyboardDeselectionCase[] = [
	{
		fullName:
			'calls onChange on de-selecting an option in multi select tab key is pressed while focusing option > should call onChange() prop with selected option',
		index: 1,
		keyCode: 9,
		key: 'Tab',
	},
	{
		fullName:
			'calls onChange on de-selecting an option in multi select enter key is pressed while focusing option > should call onChange() prop with selected option',
		index: 3,
		keyCode: 13,
		key: 'Enter',
	},
	{
		fullName:
			'calls onChange on de-selecting an option in multi select space key is pressed while focusing option > should call onChange() prop with selected option',
		index: 1,
		keyCode: 32,
		key: ' ',
	},
];

for (const deselectionCase of KEYBOARD_DESELECTION_CASES) {
	upstreamTest(deselectionCase.fullName, function deselectsByKeyboard() {
		assertKeyboardDeselection(deselectionCase);
	});
}

upstreamTest(
	'focus on options > keyboard interaction with Menu single select > disabled options should be focusable',
	function focusesDisabledOption() {
		const options = [
			{ label: 'option 0', value: 'zero' },
			{ label: 'option 1', value: 'one', isDisabled: true },
			{ label: 'option 2', value: 'two' },
		];
		const result = renderSelect({ menuIsOpen: true, options });
		const menuElement = menu(result.container);
		if (!menuElement) throw new Error('Expected select menu');
		fireEvent.keyDown(menuElement, { key: 'ArrowDown', keyCode: 40 });
		expect(focusedOption(result.container).textContent).toBe('option 1');
	},
);

upstreamTest(
	'hitting escape does not call onChange if menu is Open',
	function ignoresOpenMenuEscape() {
		const onChange = vi.fn();
		const result = renderSelect({
			escapeClearsValue: true,
			isClearable: true,
			menuIsOpen: true,
			onChange,
		});
		const menuElement = menu(result.container);
		if (!menuElement) throw new Error('Expected select menu');
		fireEvent.keyDown(menuElement, { key: 'ArrowDown', keyCode: 40 });
		expect(onChange).not.toHaveBeenCalled();
	},
);

upstreamTest(
	'multi select >  calls onChange when option is selected and isSearchable is false',
	function selectsNonSearchableMultiOption() {
		const onChange = vi.fn();
		const result = renderSelect({
			delimiter: ',',
			isMulti: true,
			isSearchable: false,
			menuIsOpen: true,
			onChange,
		});
		fireEvent.click(optionWithText(result.container, '0'));
		expect(onChange).toHaveBeenCalledWith([OPTIONS[0]], {
			action: 'select-option',
			name: 'test-input-name',
			option: OPTIONS[0],
		});
	},
);

upstreamTest(
	'does not select anything when a disabled option is the only item in the list after a search',
	function ignoresOnlyDisabledSearchResult() {
		const onChange = vi.fn();
		const options = [{ label: 'opt', value: 'opt1', isDisabled: true }, ...OPTIONS];
		const result = renderSelect({
			inputValue: 'opt',
			menuIsOpen: true,
			onChange,
			options,
		});
		const menuElement = menu(result.container);
		if (!menuElement) throw new Error('Expected select menu');
		fireEvent.keyDown(menuElement, { key: 'Enter', keyCode: 13 });
		expect(onChange).not.toHaveBeenCalled();
		expect(optionTexts(result.container)).toEqual(['opt']);
	},
);

function CustomInput() {
	return createElement('div', { className: 'my-input-component' });
}

upstreamTest('render custom Input Component', function rendersCustomInput() {
	const result = renderSelect({ components: { Input: CustomInput } });
	expect(result.container.querySelector('input.react-select__input')).toBeNull();
	expect(result.container.querySelector('.my-input-component')).toBeTruthy();
});

function CustomMenu() {
	return createElement('div', { className: 'my-menu-component' });
}

upstreamTest('render custom Menu Component', function rendersCustomMenu() {
	const result = renderSelect({ components: { Menu: CustomMenu }, menuIsOpen: true });
	expect(result.container.querySelector('.react-select__menu')).toBeNull();
	expect(result.container.querySelector('.my-menu-component')).toBeTruthy();
});

function CustomOption() {
	return createElement('div', { className: 'my-option-component' });
}

upstreamTest('render custom Option Component', function rendersCustomOption() {
	const result = renderSelect({ components: { Option: CustomOption }, menuIsOpen: true });
	expect(result.container.querySelector('.react-select__option')).toBeNull();
	expect(result.container.querySelector('.my-option-component')).toBeTruthy();
});

interface ControlProbe {
	getValue(): readonly unknown[];
}

function assertSelectValue(value: unknown, isMulti: boolean, expected: readonly unknown[]): void {
	let captured: readonly unknown[] = [];
	function Control(props: ControlProbe): null {
		captured = props.getValue();
		return null;
	}
	renderSelect({ components: { Control }, isMulti, value });
	expect(captured).toEqual(expected);
}

upstreamTest(
	'value prop single select > should set it as initial value',
	function exposesSingleValue() {
		assertSelectValue(OPTIONS[2], false, [OPTIONS[2]]);
	},
);

upstreamTest(
	'value prop single select > with option values as number > should set it as initial value',
	function exposesSingleNumericValue() {
		assertSelectValue(NUMBER_OPTIONS[2], false, [NUMBER_OPTIONS[2]]);
	},
);

upstreamTest(
	'value prop multi select > should set it as initial value',
	function exposesMultiValue() {
		assertSelectValue(OPTIONS[1], true, [OPTIONS[1]]);
	},
);

upstreamTest(
	'value prop multi select > with option values as number > should set it as initial value',
	function exposesMultiNumericValue() {
		assertSelectValue(NUMBER_OPTIONS[1], true, [NUMBER_OPTIONS[1]]);
	},
);

upstreamTest(
	'accessibility > to show the number of options available in A11yText when the menu is Open',
	function announcesAvailableOptions() {
		const result = renderSelect({ autoFocus: true, menuIsOpen: true });
		fireEvent.focus(inputFor(result.container));
		expect(result.container.querySelector('#aria-results')?.textContent).toMatch(
			/17 results available/,
		);
		result.rerender({
			props: basicProps({ autoFocus: true, inputValue: '10', menuIsOpen: true }),
		});
		expect(result.container.querySelector('#aria-results')?.textContent).toMatch(
			/1 result available/,
		);
	},
);

upstreamTest(
	'accessibility > screenReaderStatus function prop > to pass custom text to A11yText',
	function announcesCustomStatus() {
		function screenReaderStatus(value: { count: number }): string {
			return `There are ${value.count} options available`;
		}
		const result = renderSelect({ menuIsOpen: true, screenReaderStatus });
		fireEvent.focus(inputFor(result.container));
		expect(result.container.querySelector('#aria-results')?.textContent).toMatch(
			'There are 17 options available',
		);
		result.rerender({
			props: basicProps({ inputValue: '10', menuIsOpen: true, screenReaderStatus }),
		});
		expect(result.container.querySelector('#aria-results')?.textContent).toMatch(
			'There are 1 options available',
		);
	},
);

upstreamTest(
	'accessibility > announces already selected values when focused',
	function announcesSelectedValue() {
		const result = renderSelect({ value: OPTIONS[0] });
		expect(result.container.querySelector('#aria-selection')).toBeNull();
		fireEvent.focus(inputFor(result.container));
		expect(result.container.querySelector('#aria-selection')?.textContent).toMatch(
			'option 0, selected.',
		);
	},
);

upstreamTest('accessibility > announces cleared values', function announcesClearedValue() {
	const result = renderSelect({ isClearable: true, value: OPTIONS[0] });
	fireEvent.focus(inputFor(result.container));
	const clear = result.container.querySelector<HTMLElement>('.react-select__clear-indicator');
	if (!clear) throw new Error('Expected clear indicator');
	fireEvent.mouseDown(clear);
	expect(result.container.querySelector('#aria-selection')?.textContent).toMatch(
		'All selected options have been cleared.',
	);
});

interface RequiredFixtureProps {
	readonly isMulti: boolean;
	readonly isSearchable: boolean;
	readonly value: unknown;
}

function RequiredFixture(props: RequiredFixtureProps) {
	return createElement(
		'form',
		{ id: 'formTest' },
		createElement(Select, basicProps({ ...props, required: true })),
	);
}

function assertRequiredValidation(isMulti: boolean, isSearchable: boolean): void {
	const result = render(RequiredFixture, {
		props: { isMulti, isSearchable, value: null },
	});
	const form = result.container.querySelector<HTMLFormElement>('#formTest');
	if (!form) throw new Error('Expected required form');
	expect(form.checkValidity()).toBe(false);
	result.rerender({
		props: { isMulti, isSearchable, value: OPTIONS[0] },
	});
	expect(form.checkValidity()).toBe(true);
}

upstreamTest(
	'`required` prop single select > should validate with value',
	function validatesRequiredSingle() {
		assertRequiredValidation(false, true);
	},
);

upstreamTest(
	'`required` prop single select (isSearchable is false) > should validate with value',
	function validatesRequiredNonSearchableSingle() {
		assertRequiredValidation(false, false);
	},
);

upstreamTest(
	'`required` prop multi select > should validate with value',
	function validatesRequiredMulti() {
		assertRequiredValidation(true, true);
	},
);

interface AriaMessageProps {
	readonly action: string;
	readonly isDisabled?: boolean;
	readonly label?: string;
}

upstreamTest(
	'accessibility > A11yTexts can be provided through ariaLiveMessages prop',
	function announcesCustomAriaMessage() {
		function onChange(props: AriaMessageProps): string {
			if (props.action === 'select-option' && !props.isDisabled) {
				return `CUSTOM: option ${props.label} is selected.`;
			}
			return '';
		}
		const result = renderSelect({
			ariaLiveMessages: { onChange },
			menuIsOpen: true,
		});
		expect(result.container.querySelector('#aria-selection')).toBeNull();
		fireEvent.focus(inputFor(result.container));
		const menuElement = menu(result.container);
		if (!menuElement) throw new Error('Expected select menu');
		fireEvent.keyDown(menuElement, { key: 'Enter', keyCode: 13 });
		expect(result.container.querySelector('#aria-selection')?.textContent).toMatch(
			'CUSTOM: option 0 is selected.',
		);
	},
);

upstreamTest(
	'to clear value when hitting escape if escapeClearsValue and isClearable are true',
	function clearsValueOnEscape() {
		const onChange = vi.fn();
		const result = renderSelect({
			escapeClearsValue: true,
			isClearable: true,
			onChange,
			value: OPTIONS[0],
		});
		const root = result.container.querySelector<HTMLElement>('.react-select');
		if (!root) throw new Error('Expected select root');
		fireEvent.keyDown(root, { key: 'Escape', keyCode: 27 });
		expect(onChange).toHaveBeenCalledWith(null, {
			action: 'clear',
			name: 'test-input-name',
			removedValues: [OPTIONS[0]],
		});
	},
);

interface ThemeShape {
	readonly borderRadius: number;
	readonly colors: Readonly<Record<string, string>>;
}

upstreamTest('renders with custom theme', function rendersCustomTheme() {
	const primary = 'rgb(255, 164, 83)';
	function theme(current: ThemeShape): ThemeShape {
		return {
			...current,
			borderRadius: 180,
			colors: { ...current.colors, primary },
		};
	}
	const result = renderSelect({ menuIsOpen: true, theme, value: OPTIONS[0] });
	const menuElement = result.container.querySelector<HTMLElement>('.react-select__menu');
	const firstOption = result.container.querySelector<HTMLElement>('.react-select__option');
	if (!menuElement || !firstOption) throw new Error('Expected themed menu');
	expect(window.getComputedStyle(menuElement).borderRadius).toBe('180px');
	expect(window.getComputedStyle(firstOption).backgroundColor).toBe(primary);
});

function assertEnterPrevention(menuIsOpen: boolean, expected: boolean): void {
	const result = renderSelect({ menuIsOpen });
	let defaultPrevented = false;
	result.container.addEventListener('keydown', function recordsPrevention(event) {
		defaultPrevented = event.defaultPrevented;
	});
	const root = result.container.querySelector<HTMLElement>('.react-select');
	if (!root) throw new Error('Expected select root');
	fireEvent.keyDown(root, { key: 'Enter', keyCode: 13 });
	expect(defaultPrevented).toBe(expected);
}

upstreamTest(
	'Clicking Enter on a focused select while menuIsOpen && focusedOption && !isComposing  > should invoke event.preventDefault',
	function preventsOpenMenuEnter() {
		assertEnterPrevention(true, true);
	},
);

upstreamTest(
	'Clicking Enter on a focused select while !menuIsOpen > should not invoke event.preventDefault',
	function allowsClosedMenuEnter() {
		assertEnterPrevention(false, false);
	},
);

interface MenuRerender {
	(): void;
}

function assertClickOpensMenu(isMulti: boolean): void {
	let rerenderMenu: MenuRerender | undefined;
	function onMenuOpen(): void {
		rerenderMenu?.();
	}
	const result = renderSelect({ isMulti, onMenuOpen });
	function rerenderOpenMenu(): void {
		result.rerender({
			props: basicProps({ isMulti, menuIsOpen: true }),
		});
	}
	rerenderMenu = rerenderOpenMenu;
	const indicator = result.container.querySelector<HTMLElement>(
		'.react-select__dropdown-indicator',
	);
	if (!indicator) throw new Error('Expected dropdown indicator');
	fireEvent.mouseDown(indicator, { button: 0 });
	expect(focusedOption(result.container).textContent).toBe('0');
}

upstreamTest(
	'click to open select single select > should focus the first option',
	function opensSingleMenuByClick() {
		assertClickOpensMenu(false);
	},
);

upstreamTest(
	'click to open select multi select > should focus the first option',
	function opensMultiMenuByClick() {
		assertClickOpensMenu(true);
	},
);

upstreamTest(
	'close menu on hitting escape and clear input value if menu is open even if escapeClearsValue and isClearable are true',
	function closesMenuBeforeClearingValue() {
		const onInputChange = vi.fn();
		const onMenuClose = vi.fn();
		const result = renderSelect({
			escapeClearsValue: true,
			isClearable: true,
			menuIsOpen: true,
			onInputChange,
			onMenuClose,
			value: OPTIONS[0],
		});
		const root = result.container.querySelector<HTMLElement>('.react-select');
		if (!root) throw new Error('Expected select root');
		fireEvent.keyDown(root, { key: 'Escape', keyCode: 27 });
		expect(result.container.querySelector('.react-select__single-value')?.textContent).toBe('0');
		expect(onMenuClose).toHaveBeenCalled();
		expect(onInputChange).toHaveBeenCalledWith('', {
			action: 'menu-close',
			prevInputValue: '',
		});
	},
);

function assertDisabledEnterAfterFocus(isMulti: boolean): void {
	const onChange = vi.fn();
	const options = [
		{ label: 'option 1', value: 'opt1' },
		{ label: 'option 2', value: 'opt2', isDisabled: true },
	];
	const result = renderSelect({ isMulti, menuIsOpen: true, onChange, options });
	const menuElement = menu(result.container);
	if (!menuElement) throw new Error('Expected select menu');
	fireEvent.keyDown(menuElement, { key: 'ArrowDown', keyCode: 40 });
	expect(focusedOption(result.container).textContent).toBe('option 2');
	fireEvent.keyDown(menuElement, { key: 'Enter', keyCode: 13 });
	expect(onChange).not.toHaveBeenCalled();
}

upstreamTest(
	'pressing enter on disabled option single select > should not select the disabled option',
	function ignoresFocusedSingleDisabledOption() {
		assertDisabledEnterAfterFocus(false);
	},
);

upstreamTest(
	'pressing enter on disabled option multi select > should not select the disabled option',
	function ignoresFocusedMultiDisabledOption() {
		assertDisabledEnterAfterFocus(true);
	},
);

upstreamTest(
	'accessibility > interacting with disabled options shows correct A11yText',
	function announcesDisabledOption() {
		const options = [
			{ label: '0', value: 'zero' },
			{ label: '1', value: 'one', isDisabled: true },
			{ label: '2', value: 'two' },
		];
		const result = renderSelect({ menuIsOpen: true, options });
		fireEvent.focus(inputFor(result.container));
		const menuElement = menu(result.container);
		if (!menuElement) throw new Error('Expected select menu');
		fireEvent.keyDown(menuElement, { key: 'ArrowDown', keyCode: 40 });
		fireEvent.keyDown(menuElement, { key: 'Enter', keyCode: 13 });
		expect(result.container.querySelector('#aria-selection')?.textContent).toMatch(
			'option 1 is disabled. Select another option.',
		);
	},
);

upstreamTest(
	'accessibility > interacting with multi values options shows correct A11yText',
	function announcesFocusedMultiValues() {
		const options = [
			{ label: '0', value: 'zero' },
			{ label: '1', value: 'one', isDisabled: true },
			{ label: '2', value: 'two' },
		];
		const result = renderSelect({
			hideSelectedOptions: false,
			isMulti: true,
			options,
			value: [options[0], options[1]],
		});
		const input = inputFor(result.container);
		fireEvent.focus(input);
		fireEvent.keyDown(input, { key: 'ArrowLeft', keyCode: 37 });
		expect(result.container.querySelector('#aria-focused')?.textContent).toMatch(
			'value 1 focused, 2 of 2.',
		);
		fireEvent.keyDown(input, { key: 'ArrowLeft', keyCode: 37 });
		expect(result.container.querySelector('#aria-focused')?.textContent).toMatch(
			'value 0 focused, 1 of 2.',
		);
	},
);

upstreamTest(
	'hitting spacebar should select option if isSearchable is false',
	function selectsFocusedOptionWithSpace() {
		const onChange = vi.fn();
		const result = renderSelect({ isSearchable: true, menuIsOpen: true, onChange });
		const root = result.container.querySelector<HTMLElement>('.react-select');
		if (!root) throw new Error('Expected select root');
		fireEvent.keyDown(root, { key: ' ', keyCode: 32 });
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange.mock.calls[0][0]).toEqual(OPTIONS[0]);
		expect(onChange.mock.calls[0][1]).toMatchObject({
			action: 'select-option',
			name: 'test-input-name',
		});
	},
);
