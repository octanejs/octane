import type { InputActionMeta, Options, PropsValue } from './types';

export type ClassNamesState = Record<string, boolean>;

function applyPrefixToName(prefix: string, name: string): string {
	if (!name) return prefix;
	if (name[0] === '-') return prefix + name;
	return `${prefix}__${name}`;
}

export function classNames(
	prefix?: string | null,
	state?: ClassNamesState,
	...classNameList: Array<string | undefined>
): string {
	const names = [...classNameList];
	if (state && prefix) {
		for (const key in state) {
			if (Object.prototype.hasOwnProperty.call(state, key) && state[key]) {
				names.push(applyPrefixToName(prefix, key));
			}
		}
	}
	return names
		.filter((name): name is string => Boolean(name))
		.map((name) => String(name).trim())
		.join(' ');
}

export function cleanValue<Option>(value: PropsValue<Option>): Options<Option> {
	if (Array.isArray(value)) return value.filter(Boolean) as Option[];
	if (typeof value === 'object' && value !== null) return [value as Option];
	return [];
}

export function handleInputChange(
	inputValue: string,
	actionMeta: InputActionMeta,
	onInputChange?: (newValue: string, actionMeta: InputActionMeta) => string | void,
): string {
	if (onInputChange) {
		const nextValue = onInputChange(inputValue, actionMeta);
		if (typeof nextValue === 'string') return nextValue;
	}
	return inputValue;
}

export function scrollOptionIntoView(menuElement: HTMLElement, focusedElement: HTMLElement): void {
	const menuRect = menuElement.getBoundingClientRect();
	const focusedRect = focusedElement.getBoundingClientRect();
	const overScroll = focusedElement.offsetHeight / 3;
	if (focusedRect.bottom + overScroll > menuRect.bottom) {
		menuElement.scrollTop = Math.min(
			focusedElement.offsetTop +
				focusedElement.clientHeight -
				menuElement.offsetHeight +
				overScroll,
			menuElement.scrollHeight,
		);
	} else if (focusedRect.top - overScroll < menuRect.top) {
		menuElement.scrollTop = Math.max(focusedElement.offsetTop - overScroll, 0);
	}
}

export function valueTernary<Option, IsMulti extends boolean>(
	isMulti: IsMulti | undefined,
	multiValue: readonly Option[],
	singleValue: Option,
): IsMulti extends true ? readonly Option[] : Option {
	return (isMulti ? multiValue : singleValue) as IsMulti extends true ? readonly Option[] : Option;
}
