import type { CSSObjectWithLabel, Theme } from './types';

type Themed = { theme: Theme };
type Disabled = { isDisabled: boolean };
type Focused = { isFocused: boolean };

export const clearIndicatorCSS = indicatorCSS;

export function containerCSS(props: Disabled & { isRtl: boolean }): CSSObjectWithLabel {
	return {
		label: 'container',
		direction: props.isRtl ? 'rtl' : undefined,
		pointerEvents: props.isDisabled ? 'none' : undefined,
		position: 'relative',
	};
}

export function controlCSS(
	props: Themed & Disabled & Focused,
	unstyled: boolean,
): CSSObjectWithLabel {
	const { colors, borderRadius, spacing } = props.theme;
	return {
		label: 'control',
		alignItems: 'center',
		cursor: 'default',
		display: 'flex',
		flexWrap: 'wrap',
		justifyContent: 'space-between',
		minHeight: spacing.controlHeight,
		outline: '0 !important',
		position: 'relative',
		transition: 'all 100ms',
		...(unstyled
			? {}
			: {
					backgroundColor: props.isDisabled ? colors.neutral5 : colors.neutral0,
					borderColor: props.isDisabled
						? colors.neutral10
						: props.isFocused
							? colors.primary
							: colors.neutral20,
					borderRadius,
					borderStyle: 'solid',
					borderWidth: 1,
					boxShadow: props.isFocused ? `0 0 0 1px ${colors.primary}` : undefined,
					'&:hover': {
						borderColor: props.isFocused ? colors.primary : colors.neutral30,
					},
				}),
	};
}

export const dropdownIndicatorCSS = indicatorCSS;

function indicatorCSS(props: Themed & Focused, unstyled: boolean): CSSObjectWithLabel {
	const { baseUnit } = props.theme.spacing;
	const { colors } = props.theme;
	return {
		label: 'indicatorContainer',
		display: 'flex',
		transition: 'color 150ms',
		...(unstyled
			? {}
			: {
					color: props.isFocused ? colors.neutral60 : colors.neutral20,
					padding: baseUnit * 2,
					':hover': {
						color: props.isFocused ? colors.neutral80 : colors.neutral40,
					},
				}),
	};
}

export function groupCSS(props: Themed, unstyled: boolean): CSSObjectWithLabel {
	return unstyled
		? {}
		: {
				paddingBottom: props.theme.spacing.baseUnit * 2,
				paddingTop: props.theme.spacing.baseUnit * 2,
			};
}

export function groupHeadingCSS(props: Themed, unstyled: boolean): CSSObjectWithLabel {
	const { colors, spacing } = props.theme;
	return {
		label: 'group',
		cursor: 'default',
		display: 'block',
		...(unstyled
			? {}
			: {
					color: colors.neutral40,
					fontSize: '75%',
					fontWeight: 500,
					marginBottom: '0.25em',
					paddingLeft: spacing.baseUnit * 3,
					paddingRight: spacing.baseUnit * 3,
					textTransform: 'uppercase',
				}),
	};
}

export function indicatorsContainerCSS(): CSSObjectWithLabel {
	return { alignItems: 'center', alignSelf: 'stretch', display: 'flex', flexShrink: 0 };
}

export function indicatorSeparatorCSS(
	props: Themed & Disabled,
	unstyled: boolean,
): CSSObjectWithLabel {
	const { baseUnit } = props.theme.spacing;
	const { colors } = props.theme;
	return {
		label: 'indicatorSeparator',
		alignSelf: 'stretch',
		width: 1,
		...(unstyled
			? {}
			: {
					backgroundColor: props.isDisabled ? colors.neutral10 : colors.neutral20,
					marginBottom: baseUnit * 2,
					marginTop: baseUnit * 2,
				}),
	};
}

const spacingStyle = {
	gridArea: '1 / 2',
	font: 'inherit',
	minWidth: '2px',
	border: 0,
	margin: 0,
	outline: 0,
	padding: 0,
} as const;

const inputContainerStyle = {
	flex: '1 1 auto',
	display: 'inline-grid',
	gridArea: '1 / 1 / 2 / 3',
	gridTemplateColumns: '0 min-content',
	'&:after': {
		content: 'attr(data-value) " "',
		visibility: 'hidden',
		whiteSpace: 'pre',
		...spacingStyle,
	},
} as const;

export function inputCSS(
	props: Themed & { isDisabled?: boolean; value?: unknown },
	unstyled: boolean,
): CSSObjectWithLabel {
	const { spacing, colors } = props.theme;
	return {
		visibility: props.isDisabled ? 'hidden' : 'visible',
		transform: props.value ? 'translateZ(0)' : '',
		...inputContainerStyle,
		...(unstyled
			? {}
			: {
					margin: spacing.baseUnit / 2,
					paddingBottom: spacing.baseUnit / 2,
					paddingTop: spacing.baseUnit / 2,
					color: colors.neutral80,
				}),
	};
}

export function loadingIndicatorCSS(
	props: Themed & Focused & { size: number },
	unstyled: boolean,
): CSSObjectWithLabel {
	const { colors, spacing } = props.theme;
	return {
		label: 'loadingIndicator',
		display: 'flex',
		transition: 'color 150ms',
		alignSelf: 'center',
		fontSize: props.size,
		lineHeight: 1,
		marginRight: props.size,
		textAlign: 'center',
		verticalAlign: 'middle',
		...(unstyled
			? {}
			: {
					color: props.isFocused ? colors.neutral60 : colors.neutral20,
					padding: spacing.baseUnit * 2,
				}),
	};
}

function noticeCSS(props: Themed, unstyled: boolean): CSSObjectWithLabel {
	const { baseUnit } = props.theme.spacing;
	return {
		textAlign: 'center',
		...(unstyled
			? {}
			: {
					color: props.theme.colors.neutral40,
					padding: `${baseUnit * 2}px ${baseUnit * 3}px`,
				}),
	};
}

export const loadingMessageCSS = noticeCSS;

export function menuCSS(
	props: Themed & { placement: 'bottom' | 'top' },
	unstyled: boolean,
): CSSObjectWithLabel {
	const { borderRadius, spacing, colors } = props.theme;
	return {
		label: 'menu',
		[props.placement === 'bottom' ? 'top' : 'bottom']: '100%',
		position: 'absolute',
		width: '100%',
		zIndex: 1,
		...(unstyled
			? {}
			: {
					backgroundColor: colors.neutral0,
					borderRadius,
					boxShadow: '0 0 0 1px hsla(0, 0%, 0%, 0.1), 0 4px 11px hsla(0, 0%, 0%, 0.1)',
					marginBottom: spacing.menuGutter,
					marginTop: spacing.menuGutter,
				}),
	};
}

export function menuListCSS(
	props: Themed & { maxHeight: number },
	unstyled: boolean,
): CSSObjectWithLabel {
	return {
		maxHeight: props.maxHeight,
		overflowY: 'auto',
		position: 'relative',
		WebkitOverflowScrolling: 'touch',
		...(unstyled
			? {}
			: {
					paddingBottom: props.theme.spacing.baseUnit,
					paddingTop: props.theme.spacing.baseUnit,
				}),
	};
}

export function menuPortalCSS(props: {
	offset: number;
	position: 'absolute' | 'fixed';
	rect: { left: number; width: number };
}): CSSObjectWithLabel {
	return {
		left: props.rect.left,
		position: props.position,
		top: props.offset,
		width: props.rect.width,
		zIndex: 1,
	};
}

export function multiValueCSS(props: Themed, unstyled: boolean): CSSObjectWithLabel {
	const { spacing, borderRadius, colors } = props.theme;
	return {
		label: 'multiValue',
		display: 'flex',
		minWidth: 0,
		...(unstyled
			? {}
			: {
					backgroundColor: colors.neutral10,
					borderRadius: borderRadius / 2,
					margin: spacing.baseUnit / 2,
				}),
	};
}

export function multiValueLabelCSS(
	props: Themed & { cropWithEllipsis?: boolean },
	unstyled: boolean,
): CSSObjectWithLabel {
	const { borderRadius, colors } = props.theme;
	return {
		overflow: 'hidden',
		textOverflow:
			props.cropWithEllipsis || props.cropWithEllipsis === undefined ? 'ellipsis' : undefined,
		whiteSpace: 'nowrap',
		...(unstyled
			? {}
			: {
					borderRadius: borderRadius / 2,
					color: colors.neutral80,
					fontSize: '85%',
					padding: 3,
					paddingLeft: 6,
				}),
	};
}

export function multiValueRemoveCSS(
	props: Themed & Focused,
	unstyled: boolean,
): CSSObjectWithLabel {
	const { spacing, borderRadius, colors } = props.theme;
	return {
		alignItems: 'center',
		display: 'flex',
		...(unstyled
			? {}
			: {
					borderRadius: borderRadius / 2,
					backgroundColor: props.isFocused ? colors.dangerLight : undefined,
					paddingLeft: spacing.baseUnit,
					paddingRight: spacing.baseUnit,
					':hover': { backgroundColor: colors.dangerLight, color: colors.danger },
				}),
	};
}

export const noOptionsMessageCSS = noticeCSS;

export function optionCSS(
	props: Themed & Disabled & Focused & { isSelected: boolean },
	unstyled: boolean,
): CSSObjectWithLabel {
	const { spacing, colors } = props.theme;
	return {
		label: 'option',
		cursor: 'default',
		display: 'block',
		fontSize: 'inherit',
		width: '100%',
		userSelect: 'none',
		WebkitTapHighlightColor: 'rgba(0, 0, 0, 0)',
		...(unstyled
			? {}
			: {
					backgroundColor: props.isSelected
						? colors.primary
						: props.isFocused
							? colors.primary25
							: 'transparent',
					color: props.isDisabled
						? colors.neutral20
						: props.isSelected
							? colors.neutral0
							: 'inherit',
					padding: `${spacing.baseUnit * 2}px ${spacing.baseUnit * 3}px`,
					':active': {
						backgroundColor: !props.isDisabled
							? props.isSelected
								? colors.primary
								: colors.primary50
							: undefined,
					},
				}),
	};
}

export function placeholderCSS(props: Themed, unstyled: boolean): CSSObjectWithLabel {
	const { spacing, colors } = props.theme;
	return {
		label: 'placeholder',
		gridArea: '1 / 1 / 2 / 3',
		...(unstyled
			? {}
			: {
					color: colors.neutral50,
					marginLeft: spacing.baseUnit / 2,
					marginRight: spacing.baseUnit / 2,
				}),
	};
}

export function singleValueCSS(props: Themed & Disabled, unstyled: boolean): CSSObjectWithLabel {
	const { spacing, colors } = props.theme;
	return {
		label: 'singleValue',
		gridArea: '1 / 1 / 2 / 3',
		maxWidth: '100%',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
		...(unstyled
			? {}
			: {
					color: props.isDisabled ? colors.neutral40 : colors.neutral80,
					marginLeft: spacing.baseUnit / 2,
					marginRight: spacing.baseUnit / 2,
				}),
	};
}

export function valueContainerCSS(
	props: Themed & {
		isMulti: boolean;
		hasValue: boolean;
		selectProps: { controlShouldRenderValue: boolean };
	},
	unstyled: boolean,
): CSSObjectWithLabel {
	return {
		alignItems: 'center',
		display:
			props.isMulti && props.hasValue && props.selectProps.controlShouldRenderValue
				? 'flex'
				: 'grid',
		flex: 1,
		flexWrap: 'wrap',
		WebkitOverflowScrolling: 'touch',
		position: 'relative',
		overflow: 'hidden',
		...(unstyled
			? {}
			: { padding: `${props.theme.spacing.baseUnit / 2}px ${props.theme.spacing.baseUnit * 2}px` }),
	};
}

export const defaultStyles = {
	clearIndicator: clearIndicatorCSS,
	container: containerCSS,
	control: controlCSS,
	dropdownIndicator: dropdownIndicatorCSS,
	group: groupCSS,
	groupHeading: groupHeadingCSS,
	indicatorsContainer: indicatorsContainerCSS,
	indicatorSeparator: indicatorSeparatorCSS,
	input: inputCSS,
	loadingIndicator: loadingIndicatorCSS,
	loadingMessage: loadingMessageCSS,
	menu: menuCSS,
	menuList: menuListCSS,
	menuPortal: menuPortalCSS,
	multiValue: multiValueCSS,
	multiValueLabel: multiValueLabelCSS,
	multiValueRemove: multiValueRemoveCSS,
	noOptionsMessage: noOptionsMessageCSS,
	option: optionCSS,
	placeholder: placeholderCSS,
	singleValue: singleValueCSS,
	valueContainer: valueContainerCSS,
};
