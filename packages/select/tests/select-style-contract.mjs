import { resolveStyle } from './style-adapter.mjs';

export const CONTROL_COMPONENT_PROP_KEYS = Object.freeze([
	'children',
	'clearValue',
	'cx',
	'getClassNames',
	'getStyles',
	'getValue',
	'hasValue',
	'innerProps',
	'innerRef',
	'isDisabled',
	'isFocused',
	'isMulti',
	'isRtl',
	'menuIsOpen',
	'options',
	'selectOption',
	'selectProps',
	'setValue',
	'theme',
]);

export function resolveSelectStyle(cache, props, name, classNamesState) {
	const cssValue = props.getStyles(name, props);
	const className = props.cx(
		classNamesState ?? {},
		props.getClassNames(name, props),
		props.className,
	);
	return resolveStyle(cache, cssValue, className, props.theme);
}

export function assertComponentContract(props, expectedKeys) {
	const actual = Object.keys(props).sort();
	const expected = [...expectedKeys].sort();
	if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
		throw new Error(
			`React Select component contract mismatch: expected ${expected.join(', ')}, received ${actual.join(', ')}`,
		);
	}
	return props;
}
