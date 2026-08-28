import type { CSSObjectWithLabel, GroupBase } from './types';

export type StyleKey =
	| 'clearIndicator'
	| 'container'
	| 'control'
	| 'dropdownIndicator'
	| 'group'
	| 'groupHeading'
	| 'indicatorsContainer'
	| 'indicatorSeparator'
	| 'input'
	| 'loadingIndicator'
	| 'loadingMessage'
	| 'menu'
	| 'menuList'
	| 'menuPortal'
	| 'multiValue'
	| 'multiValueLabel'
	| 'multiValueRemove'
	| 'noOptionsMessage'
	| 'option'
	| 'placeholder'
	| 'singleValue'
	| 'valueContainer';

export type StylesConfig<
	Option = unknown,
	IsMulti extends boolean = boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
> = Partial<Record<StyleKey, (base: CSSObjectWithLabel, props: unknown) => CSSObjectWithLabel>>;

export type ClassNamesConfig<
	Option = unknown,
	IsMulti extends boolean = boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
> = Partial<Record<StyleKey, (props: unknown) => string>>;

export function mergeStyles<Option, IsMulti extends boolean, Group extends GroupBase<Option>>(
	source: StylesConfig<Option, IsMulti, Group>,
	target: StylesConfig<Option, IsMulti, Group> = {},
): StylesConfig<Option, IsMulti, Group> {
	const styles = { ...source };
	for (const keyAsString of Object.keys(target)) {
		const key = keyAsString as StyleKey;
		if (source[key]) {
			styles[key] = (base, props) => target[key]!(source[key]!(base, props), props);
		} else {
			styles[key] = target[key];
		}
	}
	return styles;
}
