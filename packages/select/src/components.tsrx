import {
	createContext,
	createPortal,
	useCallback,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'octane';
import type { OctaneNode } from 'octane';
import type { Octane } from 'octane/jsx-runtime';
import { autoUpdate } from '@floating-ui/dom';

import type { CSSObjectWithLabel, GroupBase, Theme } from './types';
import { createKeyframes } from './style-adapter';
import { useStyleResolver } from './style-context.tsrx';

export type Ref<T> = ((value: T | null) => void) | { current: T | null } | null;
export type ClassNamesState = Record<string, boolean>;
export type CX = (state: ClassNamesState, ...classNames: (string | undefined)[]) => string;
type DivProps =
	Omit<Octane.JSX.IntrinsicElements['div'], 'ref'> & {
		ref?: Octane.Ref<HTMLDivElement>;
	};
type InputPropsBase = Omit<Octane.JSX.IntrinsicElements['input'], 'ref'>;
type SpanProps = Octane.JSX.IntrinsicElements['span'];
type SvgProps = Octane.JSX.IntrinsicElements['svg'];

export interface CommonComponentProps<
	Option = unknown,
	IsMulti extends boolean = boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
> {
	[key: string]: unknown;
	className?: string;
	cx: CX;
	getClassNames: (name: string, props: unknown) => string | undefined;
	getStyles: (name: string, props: unknown) => CSSObjectWithLabel;
	hasValue: boolean;
	isMulti: boolean;
	isRtl: boolean;
	selectProps: { controlShouldRenderValue: boolean } & Record<string, unknown>;
	theme: Theme;
}

function useStyleProps(
	props: CommonComponentProps,
	name: string,
	state: ClassNamesState = {},
): { className: string; ref?: undefined } {
	const resolveStyle = useStyleResolver();
	const prefixed = props.cx(state, props.getClassNames(name, props), props.className);
	const css = props.getStyles(name, props);
	const implicitLabels: Record<string, string> = {
		indicatorsContainer: 'IndicatorsContainer',
		valueContainer: 'ValueContainer',
	};
	const labeledCSS =
		css.label === undefined && implicitLabels[name] !== undefined
			? { ...css, label: implicitLabels[name] }
			: css;
	return { className: resolveStyle(labeledCSS, prefixed).className };
}

const svgCSS: CSSObjectWithLabel = {
	label: 'Svg',
	display: 'inline-block',
	fill: 'currentColor',
	lineHeight: 1,
	stroke: 'currentColor',
	strokeWidth: 0,
};

export type CrossIconProps = SvgProps & { size?: number };
export function CrossIcon(props: CrossIconProps) @{
	const resolveStyle = useStyleResolver();
	const { size = 20, className, children: _children, ...rest } = props;
	const resolved = resolveStyle(svgCSS, className);
	<svg
		{...rest}
		height={size}
		width={size}
		viewBox="0 0 20 20"
		aria-hidden="true"
		focusable="false"
		className={resolved.className}
	>
		<path
			d="M14.348 14.849c-0.469 0.469-1.229 0.469-1.697 0l-2.651-3.030-2.651 3.029c-0.469 0.469-1.229 0.469-1.697 0-0.469-0.469-0.469-1.229 0-1.697l2.758-3.15-2.759-3.152c-0.469-0.469-0.469-1.228 0-1.697s1.228-0.469 1.697 0l2.652 3.031 2.651-3.031c0.469-0.469 1.228-0.469 1.697 0s0.469 1.229 0 1.697l-2.758 3.152 2.758 3.15c0.469 0.469 0.469 1.229 0 1.698z"
		/>
	</svg>
}

export type DownChevronProps = SvgProps & { size?: number };
export function DownChevron(props: DownChevronProps) @{
	const resolveStyle = useStyleResolver();
	const { size = 20, className, children: _children, ...rest } = props;
	const resolved = resolveStyle(svgCSS, className);
	<svg
		{...rest}
		height={size}
		width={size}
		viewBox="0 0 20 20"
		aria-hidden="true"
		focusable="false"
		className={resolved.className}
	>
		<path
			d="M4.516 7.548c0.436-0.446 1.043-0.481 1.576 0l3.908 3.747 3.908-3.747c0.533-0.481 1.141-0.446 1.574 0 0.436 0.445 0.408 1.197 0 1.615-0.406 0.418-4.695 4.502-4.695 4.502-0.217 0.223-0.502 0.335-0.787 0.335s-0.57-0.112-0.789-0.335c0 0-4.287-4.084-4.695-4.502s-0.436-1.17 0-1.615z"
		/>
	</svg>
}

export interface ContainerProps<
	Option = unknown,
	IsMulti extends boolean = boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
> extends CommonComponentProps<Option, IsMulti, Group> {
	children?: OctaneNode;
	innerProps: DivProps;
	isDisabled: boolean;
	isFocused: boolean;
}

export function SelectContainer(props: ContainerProps) @{
	const { children, innerProps, isDisabled, isRtl } = props;
	<div
		{...useStyleProps(props, 'container', {
			'--is-disabled': isDisabled,
			'--is-rtl': isRtl,
		})}
		{...innerProps}
	>{children}</div>
}

export interface ControlProps<
	Option = unknown,
	IsMulti extends boolean = boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
> extends CommonComponentProps<Option, IsMulti, Group> {
	children?: OctaneNode;
	innerRef: Ref<HTMLDivElement>;
	innerProps: DivProps;
	isDisabled: boolean;
	isFocused: boolean;
	menuIsOpen: boolean;
}

export function Control(props: ControlProps) @{
	const { children, isDisabled, isFocused, innerRef, innerProps, menuIsOpen } = props;
	<div
		ref={innerRef}
		{...useStyleProps(props, 'control', {
			control: true,
			'control--is-disabled': isDisabled,
			'control--is-focused': isFocused,
			'control--menu-is-open': menuIsOpen,
		})}
		{...innerProps}
		aria-disabled={isDisabled || undefined}
	>{children}</div>
}

export interface ValueContainerProps<
	Option = unknown,
	IsMulti extends boolean = boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
> extends CommonComponentProps<Option, IsMulti, Group> {
	children?: OctaneNode;
	innerProps?: DivProps;
	isDisabled: boolean;
}

export function ValueContainer(props: ValueContainerProps) @{
	const { children, innerProps, isMulti, hasValue } = props;
	<div
		{...useStyleProps(props, 'valueContainer', {
			'value-container': true,
			'value-container--is-multi': isMulti,
			'value-container--has-value': hasValue,
		})}
		{...innerProps}
	>{children}</div>
}

export interface IndicatorsContainerProps<
	Option = unknown,
	IsMulti extends boolean = boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
> extends CommonComponentProps<Option, IsMulti, Group> {
	children?: OctaneNode;
	innerProps?: DivProps;
	isDisabled: boolean;
}

export function IndicatorsContainer(props: IndicatorsContainerProps) @{
	<div
		{...useStyleProps(props, 'indicatorsContainer', { indicators: true })}
		{...props.innerProps}
	>{props.children}</div>
}

export interface PlaceholderProps<
	Option = unknown,
	IsMulti extends boolean = boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
> extends CommonComponentProps<Option, IsMulti, Group> {
	children?: OctaneNode;
	innerProps?: DivProps;
	isDisabled: boolean;
	isFocused: boolean;
}

export function Placeholder(props: PlaceholderProps) @{
	<div
		{...useStyleProps(props, 'placeholder', { placeholder: true })}
		{...props.innerProps}
	>{props.children}</div>
}

export interface SingleValueProps<
	Option = unknown,
	IsMulti extends boolean = boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
> extends CommonComponentProps<Option, IsMulti, Group> {
	children?: OctaneNode;
	data: unknown;
	innerProps?: DivProps;
	isDisabled: boolean;
}

export function SingleValue(props: SingleValueProps) @{
	<div
		{...useStyleProps(props, 'singleValue', {
			'single-value': true,
			'single-value--is-disabled': props.isDisabled,
		})}
		{...props.innerProps}
	>{props.children}</div>
}

export interface OptionProps<
	Option = unknown,
	IsMulti extends boolean = boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
> extends CommonComponentProps<Option, IsMulti, Group> {
	children?: OctaneNode;
	data: unknown;
	innerRef: Ref<HTMLDivElement>;
	innerProps: DivProps;
	label: string;
	type: 'option';
	isDisabled: boolean;
	isFocused: boolean;
	isSelected: boolean;
}

export function Option(props: OptionProps) @{
	<div
		{...useStyleProps(props, 'option', {
			option: true,
			'option--is-disabled': props.isDisabled,
			'option--is-focused': props.isFocused,
			'option--is-selected': props.isSelected,
		})}
		ref={props.innerRef}
		aria-disabled={props.isDisabled}
		{...props.innerProps}
	>{props.children}</div>
}

export interface InputProps<
	Option = unknown,
	IsMulti extends boolean = boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
> extends CommonComponentProps<Option, IsMulti, Group>, Omit<InputPropsBase, 'className'> {
	innerRef?: Ref<HTMLInputElement>;
	isHidden: boolean;
	isDisabled?: boolean;
	inputClassName?: string;
}

const inputSpacingStyle = {
	gridArea: '1 / 2',
	font: 'inherit',
	minWidth: '2px',
	border: 0,
	margin: 0,
	outline: 0,
	padding: 0,
} as const;

function inputStyle(isHidden: boolean) {
	return {
		label: 'input',
		color: 'inherit',
		background: 0,
		opacity: isHidden ? 0 : 1,
		width: '100%',
		...inputSpacingStyle,
	};
}

export function Input(props: InputProps) @{
	const {
		className: _className,
		clearValue: _clearValue,
		cx,
		getStyles: _getStyles,
		getClassNames: _getClassNames,
		getValue: _getValue,
		hasValue: _hasValue,
		isMulti: _isMulti,
		isRtl: _isRtl,
		options: _options,
		selectOption: _selectOption,
		selectProps: _selectProps,
		setValue: _setValue,
		theme: _theme,
		innerRef,
		isDisabled,
		isHidden,
		inputClassName,
		value,
		...innerProps
	} = props;
	<div {...useStyleProps(props, 'input', { 'input-container': true })} data-value={value || ''}>
		<input
			className={cx({ input: true }, inputClassName)}
			ref={innerRef ?? null}
			style={inputStyle(isHidden)}
			disabled={isDisabled}
			value={value}
			{...innerProps}
		/>
	</div>
}

export interface IndicatorProps<
	Option = unknown,
	IsMulti extends boolean = boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
> extends CommonComponentProps<Option, IsMulti, Group> {
	children?: OctaneNode;
	innerProps: DivProps;
	isFocused: boolean;
	isDisabled: boolean;
}

export function DropdownIndicator(props: IndicatorProps) @{
	<div
		{...useStyleProps(props, 'dropdownIndicator', {
			indicator: true,
			'dropdown-indicator': true,
		})}
		{...props.innerProps}
	>
		{props.children || <DownChevron />}
	</div>
}

export function ClearIndicator(props: IndicatorProps) @{
	<div
		{...useStyleProps(props, 'clearIndicator', {
			indicator: true,
			'clear-indicator': true,
		})}
		{...props.innerProps}
	>
		{props.children || <CrossIcon />}
	</div>
}

export interface IndicatorSeparatorProps<
	Option = unknown,
	IsMulti extends boolean = boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
> extends CommonComponentProps<Option, IsMulti, Group> {
	isDisabled: boolean;
	isFocused: boolean;
	innerProps?: SpanProps;
}

export function IndicatorSeparator(props: IndicatorSeparatorProps) @{
	<span
		{...props.innerProps}
		{...useStyleProps(props, 'indicatorSeparator', { 'indicator-separator': true })}
	/>
}

export interface MenuProps<
	Option = unknown,
	IsMulti extends boolean = boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
> extends CommonComponentProps<Option, IsMulti, Group> {
	children?: OctaneNode;
	innerRef: Ref<HTMLDivElement>;
	innerProps: DivProps;
	isLoading: boolean;
	placement: 'bottom' | 'top';
	minMenuHeight: number;
	maxMenuHeight: number;
	menuPlacement: 'auto' | 'bottom' | 'top';
	menuPosition: 'absolute' | 'fixed';
	menuShouldScrollIntoView: boolean;
}

export function Menu(props: MenuProps) @{
	<div
		{...useStyleProps(props, 'menu', { menu: true })}
		ref={props.innerRef}
		{...props.innerProps}
	>{props.children}</div>
}

export interface MenuListProps<
	Option = unknown,
	IsMulti extends boolean = boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
> extends CommonComponentProps<Option, IsMulti, Group> {
	children?: OctaneNode;
	innerRef: Ref<HTMLDivElement>;
	innerProps: DivProps;
	maxHeight: number;
	focusedOption: unknown;
}

export function MenuList(props: MenuListProps) @{
	<div
		{...useStyleProps(props, 'menuList', {
			'menu-list': true,
			'menu-list--is-multi': props.isMulti,
		})}
		ref={props.innerRef}
		{...props.innerProps}
	>{props.children}</div>
}

export interface NoticeProps<
	Option = unknown,
	IsMulti extends boolean = boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
> extends CommonComponentProps<Option, IsMulti, Group> {
	children?: OctaneNode;
	innerProps?: DivProps;
}

export function NoOptionsMessage(props: NoticeProps) @{
	const children = props.children ?? 'No options';
	<div
		{...useStyleProps(props, 'noOptionsMessage', {
			'menu-notice': true,
			'menu-notice--no-options': true,
		})}
		{...props.innerProps}
	>{children}</div>
}

export function LoadingMessage(props: NoticeProps) @{
	const children = props.children ?? 'Loading...';
	<div
		{...useStyleProps(props, 'loadingMessage', {
			'menu-notice': true,
			'menu-notice--loading': true,
		})}
		{...props.innerProps}
	>{children}</div>
}

type ComponentType<Props> = (props: Props) => Octane.JSX.Element;

function cleanCommonProps<Props extends CommonComponentProps>(props: Props) {
	const {
		className: _className,
		cx: _cx,
		getStyles: _getStyles,
		getClassNames: _getClassNames,
		hasValue: _hasValue,
		isMulti: _isMulti,
		isRtl: _isRtl,
		selectProps: _selectProps,
		theme: _theme,
		...innerProps
	} = props;
	return innerProps;
}

export type GroupHeadingProps<
	Option = unknown,
	IsMulti extends boolean = boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
> =
	CommonComponentProps<Option, IsMulti, Group> & Omit<DivProps, 'className'> & {
		children?: OctaneNode;
		id: string;
		data: unknown;
	};

export function GroupHeading(props: GroupHeadingProps) @{
	const { data: _data, ...innerProps } = cleanCommonProps(props);
	<div {...useStyleProps(props, 'groupHeading', { 'group-heading': true })} {...innerProps} />
}

export interface GroupProps<
	Option = unknown,
	IsMulti extends boolean = boolean,
	GroupType extends GroupBase<Option> = GroupBase<Option>,
> extends CommonComponentProps<Option, IsMulti, GroupType> {
	children?: OctaneNode;
	Heading: ComponentType<GroupHeadingProps>;
	headingProps: { id: string; data: unknown };
	innerProps?: DivProps;
	label?: OctaneNode;
	data: unknown;
	options: readonly unknown[];
}

export function Group(props: GroupProps) @{
	const Heading = props.Heading;
	<div {...useStyleProps(props, 'group', { group: true })} {...props.innerProps}>
		<Heading
			{...props.headingProps}
			selectProps={props.selectProps}
			theme={props.theme}
			getStyles={props.getStyles}
			getClassNames={props.getClassNames}
			cx={props.cx}
			hasValue={props.hasValue}
			isMulti={props.isMulti}
			isRtl={props.isRtl}
		>{props.label}</Heading>
		<div>{props.children}</div>
	</div>
}

export interface MultiValueGenericProps<
	Option = unknown,
	IsMulti extends boolean = boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
> {
	children?: OctaneNode;
	data: unknown;
	innerProps: DivProps;
	selectProps: Record<string, unknown>;
}

export function MultiValueGeneric(props: MultiValueGenericProps) @{
	<div {...props.innerProps}>{props.children}</div>
}

export const MultiValueContainer = MultiValueGeneric;
export const MultiValueLabel = MultiValueGeneric;

export interface MultiValueRemoveProps<
	Option = unknown,
	IsMulti extends boolean = boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
> {
	children?: OctaneNode;
	data: unknown;
	innerProps: DivProps;
	selectProps: Record<string, unknown>;
}

export function MultiValueRemove(props: MultiValueRemoveProps) @{
	<div role="button" {...props.innerProps}>{props.children || <CrossIcon size={14} />}</div>
}

export interface MultiValueProps<
	Option = unknown,
	IsMulti extends boolean = boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
> extends CommonComponentProps<Option, IsMulti, Group> {
	children?: OctaneNode;
	components: {
		Container: ComponentType<MultiValueGenericProps>;
		Label: ComponentType<MultiValueGenericProps>;
		Remove: ComponentType<MultiValueRemoveProps>;
	};
	cropWithEllipsis?: boolean;
	data: unknown;
	innerProps?: DivProps;
	isFocused: boolean;
	isDisabled: boolean;
	removeProps: DivProps;
	index: number;
}

export function MultiValue(props: MultiValueProps) @{
	const Container = props.components.Container;
	const Label = props.components.Label;
	const Remove = props.components.Remove;
	<Container
		data={props.data}
		innerProps={{
			...useStyleProps(props, 'multiValue', {
				'multi-value': true,
				'multi-value--is-disabled': props.isDisabled,
			}),
			...props.innerProps,
		}}
		selectProps={props.selectProps}
	>
		<Label
			data={props.data}
			innerProps={{
				...useStyleProps(props, 'multiValueLabel', { 'multi-value__label': true }),
			}}
			selectProps={props.selectProps}
		>{props.children}</Label>
		<Remove
			data={props.data}
			innerProps={{
				...useStyleProps(props, 'multiValueRemove', { 'multi-value__remove': true }),
				'aria-label': `Remove ${props.children || 'option'}`,
				...props.removeProps,
			}}
			selectProps={props.selectProps}
		/>
	</Container>
}

const loadingDotAnimations = createKeyframes({
	'0%, 80%, 100%': { opacity: 0 },
	'40%': { opacity: 1 },
});

function LoadingDot(props: { delay: number; offset: boolean }) @{
	const resolveStyle = useStyleResolver();
	const resolved = resolveStyle({
		animation: `${loadingDotAnimations} 1s ease-in-out ${props.delay}ms infinite;`,
		backgroundColor: 'currentColor',
		borderRadius: '1em',
		display: 'inline-block',
		marginLeft: props.offset ? '1em' : undefined,
		height: '1em',
		verticalAlign: 'top',
		width: '1em',
		label: 'LoadingDot',
	});
	<span className={resolved.className} />
}

export interface LoadingIndicatorProps<
	Option = unknown,
	IsMulti extends boolean = boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
> extends CommonComponentProps<Option, IsMulti, Group> {
	innerProps: DivProps;
	isFocused: boolean;
	isDisabled: boolean;
	size?: number;
}

export function LoadingIndicator(props: LoadingIndicatorProps) @{
	const size = props.size ?? 4;
	const styleInput = { ...props, size };
	<div
		{...useStyleProps(styleInput, 'loadingIndicator', {
			indicator: true,
			'loading-indicator': true,
		})}
		{...props.innerProps}
	>
		<LoadingDot delay={0} offset={props.isRtl} />
		<LoadingDot delay={160} offset={true} />
		<LoadingDot delay={320} offset={!props.isRtl} />
	</div>
}

type MenuPlacement = 'auto' | 'bottom' | 'top';
type MenuPosition = 'absolute' | 'fixed';
const PortalPlacementContext = createContext<
	| {
			setPortalPlacement: (placement: 'bottom' | 'top') => void;
	  }
	| null
>(null);

function coercePlacement(placement: MenuPlacement): 'bottom' | 'top' {
	return placement === 'auto' ? 'bottom' : placement;
}

function boundingClientObject(element: HTMLElement) {
	const rect = element.getBoundingClientRect();
	return {
		bottom: rect.bottom,
		height: rect.height,
		left: rect.left,
		right: rect.right,
		top: rect.top,
		width: rect.width,
	};
}

export interface MenuPortalProps<
	Option = unknown,
	IsMulti extends boolean = boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
> extends CommonComponentProps<Option, IsMulti, Group> {
	appendTo: HTMLElement | undefined;
	children?: OctaneNode;
	controlElement: HTMLDivElement | null;
	innerProps: DivProps;
	menuPlacement: MenuPlacement;
	menuPosition: MenuPosition;
}

export function MenuPortal(props: MenuPortalProps) @{
	const menuPortalRef = useRef<HTMLDivElement | null>(null);
	const cleanupRef = useRef<(() => void) | null>(null);
	const [placement, setPortalPlacement] = useState<'bottom' | 'top'>(
		coercePlacement(props.menuPlacement),
	);
	const portalPlacementContext = useMemo(() => ({ setPortalPlacement }), []);
	useLayoutEffect(() => {
		setPortalPlacement(coercePlacement(props.menuPlacement));
	}, [props.menuPlacement]);
	const [computedPosition, setComputedPosition] = useState<
		| {
				offset: number;
				rect: { left: number; width: number };
		  }
		| null
	>(null);

	const updateComputedPosition = useCallback(() => {
		if (!props.controlElement) return;
		const rect = boundingClientObject(props.controlElement);
		const scrollDistance =
			props.menuPosition === 'fixed' ? 0 : window.pageYOffset;
		const offset = rect[placement] + scrollDistance;
		if (
			offset !== computedPosition?.offset || rect.left !== computedPosition?.rect.left ||
				rect.width !== computedPosition?.rect.width
		) {
			setComputedPosition({ offset, rect });
		}
	}, [
		props.controlElement,
		props.menuPosition,
		placement,
		computedPosition?.offset,
		computedPosition?.rect.left,
		computedPosition?.rect.width,
	]);

	useLayoutEffect(() => {
		updateComputedPosition();
	}, [updateComputedPosition]);

	const runAutoUpdate = useCallback(() => {
		cleanupRef.current?.();
		cleanupRef.current = null;
		if (props.controlElement && menuPortalRef.current) {
			cleanupRef.current = autoUpdate(
				props.controlElement,
				menuPortalRef.current,
				updateComputedPosition,
				{ elementResize: 'ResizeObserver' in window },
			);
		}
	}, [props.controlElement, updateComputedPosition]);

	useLayoutEffect(() => {
		runAutoUpdate();
		return () => cleanupRef.current?.();
	}, [runAutoUpdate]);

	const setMenuPortalElement = useCallback((element: HTMLDivElement | null) => {
		menuPortalRef.current = element;
		runAutoUpdate();
	}, [runAutoUpdate]);

	if (!props.appendTo && props.menuPosition !== 'fixed' || !computedPosition) return null;

	const menuWrapperProps: DivProps = {
		...useStyleProps(
			{
				...props,
				offset: computedPosition.offset,
				position: props.menuPosition,
				rect: computedPosition.rect,
			},
			'menuPortal',
			{ 'menu-portal': true },
		),
		...props.innerProps,
		ref: [setMenuPortalElement, props.innerProps.ref],
	};
	const menuWrapper = <div {...menuWrapperProps}>{props.children}</div>;

	<PortalPlacementContext.Provider value={portalPlacementContext}>
		{props.appendTo ? createPortal(menuWrapper, props.appendTo) : menuWrapper}
	</PortalPlacementContext.Provider>
}

export interface SelectComponents<
	Option = unknown,
	IsMulti extends boolean = boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
> {
	ClearIndicator: ComponentType<IndicatorProps<Option, IsMulti, Group>>;
	Control: ComponentType<ControlProps<Option, IsMulti, Group>>;
	DropdownIndicator: ComponentType<IndicatorProps<Option, IsMulti, Group>> | null;
	DownChevron: ComponentType<DownChevronProps>;
	CrossIcon: ComponentType<CrossIconProps>;
	Group: ComponentType<GroupProps<Option, IsMulti, Group>>;
	GroupHeading: ComponentType<GroupHeadingProps<Option, IsMulti, Group>>;
	IndicatorsContainer: ComponentType<IndicatorsContainerProps<Option, IsMulti, Group>>;
	IndicatorSeparator: ComponentType<IndicatorSeparatorProps<Option, IsMulti, Group>> | null;
	Input: ComponentType<InputProps<Option, IsMulti, Group>>;
	LoadingIndicator: ComponentType<LoadingIndicatorProps<Option, IsMulti, Group>>;
	Menu: ComponentType<MenuProps<Option, IsMulti, Group>>;
	MenuList: ComponentType<MenuListProps<Option, IsMulti, Group>>;
	MenuPortal: (props: MenuPortalProps<Option, IsMulti, Group>) => Octane.JSX.Element | null;
	LoadingMessage: ComponentType<NoticeProps<Option, IsMulti, Group>>;
	NoOptionsMessage: ComponentType<NoticeProps<Option, IsMulti, Group>>;
	MultiValue: ComponentType<MultiValueProps<Option, IsMulti, Group>>;
	MultiValueContainer: ComponentType<MultiValueGenericProps<Option, IsMulti, Group>>;
	MultiValueLabel: ComponentType<MultiValueGenericProps<Option, IsMulti, Group>>;
	MultiValueRemove: ComponentType<MultiValueRemoveProps<Option, IsMulti, Group>>;
	Option: ComponentType<OptionProps<Option, IsMulti, Group>>;
	Placeholder: ComponentType<PlaceholderProps<Option, IsMulti, Group>>;
	SelectContainer: ComponentType<ContainerProps<Option, IsMulti, Group>>;
	SingleValue: ComponentType<SingleValueProps<Option, IsMulti, Group>>;
	ValueContainer: ComponentType<ValueContainerProps<Option, IsMulti, Group>>;
}

export type SelectComponentsConfig<
	Option = unknown,
	IsMulti extends boolean = boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
> =
	Partial<SelectComponents<Option, IsMulti, Group>>;

export const components: SelectComponents = {
	ClearIndicator,
	Control,
	DropdownIndicator,
	DownChevron,
	CrossIcon,
	Group,
	GroupHeading,
	IndicatorsContainer,
	IndicatorSeparator,
	Input,
	LoadingIndicator,
	Menu,
	MenuList,
	MenuPortal,
	LoadingMessage,
	NoOptionsMessage,
	MultiValue,
	MultiValueContainer,
	MultiValueLabel,
	MultiValueRemove,
	Option,
	Placeholder,
	SelectContainer,
	SingleValue,
	ValueContainer,
};

export type SelectComponentsGeneric = typeof components;

export function defaultComponents<
	Option = unknown,
	IsMulti extends boolean = boolean,
	Group extends GroupBase<Option> = GroupBase<Option>,
>(props: {
	components: SelectComponentsConfig<Option, IsMulti, Group>;
}): SelectComponents<Option, IsMulti, Group> {
	return { ...components, ...props.components } as SelectComponents<Option, IsMulti, Group>;
}
