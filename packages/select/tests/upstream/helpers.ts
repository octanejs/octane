import { describe, test } from 'vitest';

export interface Option {
	readonly label: string;
	readonly value: string;
}

export const OPTIONS: readonly Option[] = [
	{ label: '0', value: 'zero' },
	{ label: '1', value: 'one' },
	{ label: '2', value: 'two' },
	{ label: '3', value: 'three' },
	{ label: '4', value: 'four' },
	{ label: '5', value: 'five' },
	{ label: '6', value: 'six' },
	{ label: '7', value: 'seven' },
	{ label: '8', value: 'eight' },
	{ label: '9', value: 'nine' },
	{ label: '10', value: 'ten' },
	{ label: '11', value: 'eleven' },
	{ label: '12', value: 'twelve' },
	{ label: '13', value: 'thirteen' },
	{ label: '14', value: 'fourteen' },
	{ label: '15', value: 'fifteen' },
	{ label: '16', value: 'sixteen' },
];

export function inputFor(container: HTMLElement): HTMLInputElement {
	const input = container.querySelector<HTMLInputElement>('input.react-select__input');
	if (!input) throw new Error('Expected react-select input');
	return input;
}

export function optionTexts(container: HTMLElement): string[] {
	return Array.from(container.querySelectorAll('.react-select__option'), function text(option) {
		return option.textContent ?? '';
	});
}

export function dropdownIndicator(container: HTMLElement): HTMLElement {
	const indicator = container.querySelector<HTMLElement>('.react-select__dropdown-indicator');
	if (!indicator) throw new Error('Expected react-select dropdown indicator');
	return indicator;
}

export function hiddenInput(container: HTMLElement): HTMLInputElement {
	const input = container.querySelector<HTMLInputElement>('input[type="hidden"]');
	if (!input) throw new Error('Expected react-select hidden input');
	return input;
}

interface UpstreamImplementation {
	(): void | Promise<void>;
}

export function upstreamTest(fullName: string, implementation: UpstreamImplementation): void {
	const parts = fullName.split(' > ');

	function register(index: number): void {
		if (index === parts.length - 1) {
			test(parts[index], implementation);
			return;
		}
		describe(parts[index], function upstreamSuite() {
			register(index + 1);
		});
	}

	register(0);
}
