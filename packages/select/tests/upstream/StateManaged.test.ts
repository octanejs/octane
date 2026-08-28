// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@octanejs/testing-library';
import { createElement } from 'octane';
import { afterEach, expect } from 'vitest';

import { StateManagedSelect as Select } from '../../src/state-managed-select.tsrx';
import { dropdownIndicator, hiddenInput, inputFor, OPTIONS, upstreamTest } from './helpers';

afterEach(cleanup);

function basicProps(overrides: Record<string, unknown> = {}): never {
	return {
		className: 'react-select',
		classNamePrefix: 'react-select',
		name: 'test-input-name',
		options: OPTIONS,
		...overrides,
	} as never;
}

function menu(container: HTMLElement): Element | null {
	return container.querySelector('.react-select__menu');
}

upstreamTest('defaults > snapshot', function snapshotsDefaults() {
	const result = render(Select);
	expect(result.container).toMatchSnapshot();
});

upstreamTest('passes down the className prop', function passesClassName() {
	const result = render(Select, { props: basicProps() });
	expect(result.container.querySelector('.react-select')).toBeTruthy();
});

upstreamTest(
	'click on dropdown indicator single select > should toggle Menu',
	function togglesSingleMenu() {
		const result = render(Select, { props: basicProps() });
		expect(menu(result.container)).toBeNull();
		fireEvent.mouseDown(dropdownIndicator(result.container), { button: 0 });
		expect(menu(result.container)).toBeTruthy();
		fireEvent.mouseDown(dropdownIndicator(result.container), { button: 0 });
		expect(menu(result.container)).toBeNull();
	},
);

upstreamTest(
	'click on dropdown indicator multi select > should toggle Menu',
	function togglesMultiMenu() {
		const result = render(Select, { props: basicProps({ isMulti: true }) });
		expect(menu(result.container)).toBeNull();
		fireEvent.mouseDown(dropdownIndicator(result.container), { button: 0 });
		expect(menu(result.container)).toBeTruthy();
		fireEvent.mouseDown(dropdownIndicator(result.container), { button: 0 });
		expect(menu(result.container)).toBeNull();
	},
);

upstreamTest(
	'If menuIsOpen prop is passed Menu should not close on clicking Dropdown Indicator',
	function keepsControlledMenuOpen() {
		const result = render(Select, { props: basicProps({ menuIsOpen: true }) });
		expect(menu(result.container)).toBeTruthy();
		fireEvent.mouseDown(dropdownIndicator(result.container), { button: 0 });
		expect(menu(result.container)).toBeTruthy();
	},
);

upstreamTest(
	'defaultMenuIsOpen prop > should open by menu default and clicking on Dropdown Indicator should toggle menu',
	function togglesDefaultOpenMenu() {
		const result = render(Select, { props: basicProps({ defaultMenuIsOpen: true }) });
		expect(menu(result.container)).toBeTruthy();
		fireEvent.mouseDown(dropdownIndicator(result.container), { button: 0 });
		expect(menu(result.container)).toBeNull();
	},
);

upstreamTest('Menu is controllable by menuIsOpen prop', function controlsMenuWithProp() {
	const result = render(Select, { props: basicProps() });
	expect(menu(result.container)).toBeNull();
	result.rerender({ props: basicProps({ menuIsOpen: true }) });
	expect(menu(result.container)).toBeTruthy();
	result.rerender({ props: basicProps({ menuIsOpen: false }) });
	expect(menu(result.container)).toBeNull();
});

upstreamTest(
	'defaultInputValue prop > should update the inputValue on change of input if defaultInputValue prop is provided',
	function updatesDefaultInputValue() {
		const result = render(Select, { props: basicProps({ defaultInputValue: '0' }) });
		const input = inputFor(result.container);
		expect(input.value).toBe('0');
		fireEvent.input(input, { target: { value: '0A' } });
		expect(input.value).toBe('0A');
	},
);

upstreamTest(
	'inputValue prop > should not update the inputValue when on change of input if inputValue prop is provided',
	function preservesControlledInputValue() {
		const result = render(Select, { props: basicProps({ inputValue: '0' }) });
		const input = inputFor(result.container);
		expect(input.value).toBe('0');
		fireEvent.input(input, { target: { value: '0A' } });
		expect(input.value).toBe('0');
	},
);

upstreamTest(
	'defaultValue prop > should update the value on selecting option',
	function updatesDefaultValue() {
		const result = render(Select, {
			props: basicProps({ defaultValue: [OPTIONS[0]], menuIsOpen: true }),
		});
		expect(hiddenInput(result.container).value).toBe('zero');
		const options = result.container.querySelectorAll<HTMLElement>('.react-select__option');
		fireEvent.click(options[1]);
		expect(hiddenInput(result.container).value).toBe('one');
	},
);

upstreamTest(
	'value prop > should not update the value on selecting option',
	function preservesControlledValue() {
		const result = render(Select, {
			props: basicProps({ menuIsOpen: true, value: [OPTIONS[0]] }),
		});
		expect(hiddenInput(result.container).value).toBe('zero');
		const options = result.container.querySelectorAll<HTMLElement>('.react-select__option');
		fireEvent.click(options[1]);
		expect(hiddenInput(result.container).value).toBe('zero');
	},
);

upstreamTest(
	'Integration tests > selecting an option > mouse interaction single select > clicking on an option > should select the clicked option',
	function selectsSingleOptionByMouse() {
		const result = render(Select, { props: basicProps({ menuIsOpen: true }) });
		const options = result.container.querySelectorAll<HTMLElement>('.react-select__option');
		fireEvent.click(options[2], { button: 0 });
		expect(hiddenInput(result.container).value).toBe('two');
	},
);

upstreamTest(
	'Integration tests > selecting an option > mouse interaction multi select > clicking on an option > should select the clicked option',
	function selectsMultiOptionByMouse() {
		const result = render(Select, {
			props: basicProps({ delimiter: ', ', isMulti: true, menuIsOpen: true }),
		});
		const options = result.container.querySelectorAll<HTMLElement>('.react-select__option');
		fireEvent.click(options[2], { button: 0 });
		expect(hiddenInput(result.container).value).toBe('two');
	},
);

function assertControlledOpenMenu(isMulti: boolean): void {
	const result = render(Select, {
		props: basicProps({ isMulti, menuIsOpen: true }),
	});
	expect(menu(result.container)).toBeTruthy();
	fireEvent.click(dropdownIndicator(result.container));
	expect(menu(result.container)).toBeTruthy();
}

upstreamTest(
	'Menu to open by default if menuIsOpen prop is true single select > should keep Menu open by default if true is passed for menuIsOpen prop',
	function keepsSingleControlledMenuOpen() {
		assertControlledOpenMenu(false);
	},
);

upstreamTest(
	'Menu to open by default if menuIsOpen prop is true multi select > should keep Menu open by default if true is passed for menuIsOpen prop',
	function keepsMultiControlledMenuOpen() {
		assertControlledOpenMenu(true);
	},
);

upstreamTest('multi select > selecting multiple values', function selectsMultipleValues() {
	const result = render(Select, { props: basicProps({ isMulti: true }) });
	fireEvent.mouseDown(dropdownIndicator(result.container), { button: 0 });
	const firstMenu = menu(result.container);
	if (!firstMenu) throw new Error('Expected first menu');
	fireEvent.keyDown(firstMenu, { key: 'Enter', keyCode: 13 });
	expect(result.container.querySelector('.react-select__control')?.textContent).toBe('0');
	fireEvent.mouseDown(dropdownIndicator(result.container), { button: 0 });
	const secondMenu = menu(result.container);
	if (!secondMenu) throw new Error('Expected second menu');
	fireEvent.keyDown(secondMenu, { key: 'Enter', keyCode: 13 });
	expect(result.container.querySelector('.react-select__control')?.textContent).toBe('01');
});

function RequiredStateManagedFixture() {
	return createElement(
		'form',
		{ id: 'formTest' },
		createElement(Select, basicProps({ menuIsOpen: true, required: true })),
	);
}

upstreamTest('`required` prop > should validate', function validatesRequiredStateManaged() {
	const result = render(RequiredStateManagedFixture);
	const form = result.container.querySelector<HTMLFormElement>('#formTest');
	if (!form) throw new Error('Expected required form');
	expect(form.checkValidity()).toBe(false);
	const options = result.container.querySelectorAll<HTMLElement>('.react-select__option');
	fireEvent.click(options[3]);
	expect(form.checkValidity()).toBe(true);
});

interface KeyboardEventSpec {
	readonly key: string;
	readonly keyCode: number;
}

interface KeyboardCase {
	readonly events: readonly KeyboardEventSpec[];
	readonly expected: string;
	readonly fullName: string;
	readonly isMulti: boolean;
}

function assertKeyboardCase(testCase: KeyboardCase): void {
	const result = render(Select, {
		props: basicProps({ delimiter: ', ', isMulti: testCase.isMulti }),
	});
	fireEvent.mouseDown(dropdownIndicator(result.container), { button: 0 });
	const menuElement = menu(result.container);
	if (!menuElement) throw new Error('Expected keyboard menu');
	for (const event of testCase.events) fireEvent.keyDown(menuElement, event);
	fireEvent.keyDown(menuElement, { key: 'Enter', keyCode: 13 });
	expect(hiddenInput(result.container).value).toBe(testCase.expected);
}

const ARROW_DOWN: KeyboardEventSpec = { key: 'ArrowDown', keyCode: 40 };
const ARROW_UP: KeyboardEventSpec = { key: 'ArrowUp', keyCode: 38 };
const PAGE_DOWN: KeyboardEventSpec = { key: 'PageDown', keyCode: 34 };
const PAGE_UP: KeyboardEventSpec = { key: 'PageUp', keyCode: 33 };
const END: KeyboardEventSpec = { key: 'End', keyCode: 35 };
const HOME: KeyboardEventSpec = { key: 'Home', keyCode: 36 };

const KEYBOARD_CASES: readonly KeyboardCase[] = [
	{
		fullName:
			'Integration tests > selection an option > keyboard interaction single select > open select and hit enter > should select first option',
		isMulti: false,
		events: [],
		expected: OPTIONS[0].value,
	},
	{
		fullName:
			'Integration tests > selection an option > keyboard interaction single select > (open select -> 3 x ArrowDown -> Enter) > should select the forth option in the select',
		isMulti: false,
		events: [ARROW_DOWN, ARROW_DOWN, ARROW_DOWN],
		expected: OPTIONS[3].value,
	},
	{
		fullName:
			'Integration tests > selection an option > keyboard interaction single select > (open select -> 2 x ArrowDown -> 2 x ArrowUp -> Enter) > should select the first option in the select',
		isMulti: false,
		events: [ARROW_DOWN, ARROW_DOWN, ARROW_UP, ARROW_UP],
		expected: OPTIONS[0].value,
	},
	{
		fullName:
			'Integration tests > selection an option > keyboard interaction single select > (open select -> 1 x ArrowUp -> Enter) > should select the last option in the select',
		isMulti: false,
		events: [ARROW_UP],
		expected: OPTIONS[16].value,
	},
	{
		fullName:
			'Integration tests > selection an option > keyboard interaction single select > (open select -> 1 x PageDown -> Enter) > should select the first option on next page - default pageSize 5',
		isMulti: false,
		events: [PAGE_DOWN],
		expected: OPTIONS[5].value,
	},
	{
		fullName:
			'Integration tests > selection an option > keyboard interaction single select > (open select -> 1 x PageDown -> 1 x ArrowDown -> 1 x PageUp -> Enter) > should select the second option - default pageSize 5',
		isMulti: false,
		events: [PAGE_DOWN, ARROW_DOWN, PAGE_UP],
		expected: OPTIONS[1].value,
	},
	{
		fullName:
			'Integration tests > selection an option > keyboard interaction single select > (open select -> End -> Enter) > should select the last option',
		isMulti: false,
		events: [END],
		expected: OPTIONS[16].value,
	},
	{
		fullName:
			'Integration tests > selection an option > keyboard interaction single select > (open select -> 3 x PageDown -> Home -> Enter) > should select the last option',
		isMulti: false,
		events: [PAGE_DOWN, PAGE_DOWN, PAGE_DOWN, HOME],
		expected: OPTIONS[0].value,
	},
	{
		fullName:
			'Integration tests > selection an option > keyboard interaction single select > cycle options > ( open select -> End -> ArrowDown -> Enter) > should select the first option',
		isMulti: false,
		events: [END, ARROW_DOWN],
		expected: OPTIONS[0].value,
	},
	{
		fullName:
			'Integration tests > selection an option > keyboard interaction single select > cycle options > (open select -> ArrowUp -> Enter) > should select the last option',
		isMulti: false,
		events: [ARROW_UP],
		expected: OPTIONS[16].value,
	},
	{
		fullName:
			'Integration tests > selection an option > keyboard interaction multi select > open select and hit enter > should select first option',
		isMulti: true,
		events: [],
		expected: OPTIONS[0].value,
	},
	{
		fullName:
			'Integration tests > selection an option > keyboard interaction multi select > (open select -> 3 x ArrowDown -> Enter) > should select the forth option in the select',
		isMulti: true,
		events: [ARROW_DOWN, ARROW_DOWN, ARROW_DOWN],
		expected: OPTIONS[3].value,
	},
	{
		fullName:
			'Integration tests > selection an option > keyboard interaction multi select > (open select -> 2 x ArrowDown -> 2 x ArrowUp -> Enter) > should select the first option in the select',
		isMulti: true,
		events: [ARROW_DOWN, ARROW_DOWN, ARROW_UP, ARROW_UP],
		expected: OPTIONS[0].value,
	},
	{
		fullName:
			'Integration tests > selection an option > keyboard interaction multi select > (open select -> 1 x ArrowUp -> Enter) > should select the last option in the select',
		isMulti: true,
		events: [ARROW_UP],
		expected: OPTIONS[16].value,
	},
	{
		fullName:
			'Integration tests > selection an option > keyboard interaction multi select > (open select -> 1 x PageDown -> Enter) > should select the first option on next page - default pageSize 5',
		isMulti: true,
		events: [PAGE_DOWN],
		expected: OPTIONS[5].value,
	},
	{
		fullName:
			'Integration tests > selection an option > keyboard interaction multi select > (open select -> 1 x PageDown -> 1 x ArrowDown -> 1 x PageUp -> Enter) > should select the second option - default pageSize 5',
		isMulti: true,
		events: [PAGE_DOWN, ARROW_DOWN, PAGE_UP],
		expected: OPTIONS[1].value,
	},
	{
		fullName:
			'Integration tests > selection an option > keyboard interaction multi select > (open select -> End -> Enter) > should select the last option',
		isMulti: true,
		events: [END],
		expected: OPTIONS[16].value,
	},
	{
		fullName:
			'Integration tests > selection an option > keyboard interaction multi select > (open select -> 3 x PageDown -> Home -> Enter) > should select the last option',
		isMulti: true,
		events: [PAGE_DOWN, PAGE_DOWN, PAGE_DOWN, HOME],
		expected: OPTIONS[0].value,
	},
	{
		fullName:
			'Integration tests > selection an option > keyboard interaction multi select > cycle options > ( open select -> End -> ArrowDown -> Enter) > should select the first option',
		isMulti: true,
		events: [END, ARROW_DOWN],
		expected: OPTIONS[0].value,
	},
	{
		fullName:
			'Integration tests > selection an option > keyboard interaction multi select > cycle options > (open select -> ArrowUp -> Enter) > should select the last option',
		isMulti: true,
		events: [ARROW_UP],
		expected: OPTIONS[16].value,
	},
];

for (const keyboardCase of KEYBOARD_CASES) {
	upstreamTest(keyboardCase.fullName, function selectsByKeyboard() {
		assertKeyboardCase(keyboardCase);
	});
}
