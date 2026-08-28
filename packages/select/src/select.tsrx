import {
	createElement,
	Fragment,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'octane';
import type { OctaneNode } from 'octane';
import type { Octane } from 'octane/jsx-runtime';

import {
	formatGroupLabel as formatGroupLabelBuiltin,
	getOptionLabel as getOptionLabelBuiltin,
	getOptionValue as getOptionValueBuiltin,
	isOptionDisabled as isOptionDisabledBuiltin,
} from './builtins';
import {
	components as builtinComponents,
	defaultComponents,
	type SelectComponents,
	type SelectComponentsConfig,
	type Ref,
} from './components.tsrx';
import { createFilter, type FilterOptionOption } from './filters';
import { defaultStyles } from './default-styles';
import { getMenuPlacement } from './menu-placement';
import { useScrollManager } from './scroll-manager';
import { useStyleResolver } from './style-context.tsrx';
import type { AriaLiveMessages, AriaSelection } from './accessibility-types';
import type { ClassNamesConfig, StyleKey, StylesConfig } from './styles';
import { defaultTheme, type ThemeConfig } from './theme';
import type {
	ActionMeta,
	CSSObjectWithLabel,
	FocusDirection,
	GetOptionLabel,
	GetOptionValue,
	GroupBase,
	InputActionMeta,
	OnChangeValue,
	Options,
	OptionsOrGroups,
	PropsValue,
	SetValueAction,
	Theme,
} from './types';
import { classNames, cleanValue, scrollOptionIntoView, valueTernary } from './utils';
import { needsInspectableValueChildren } from './animated-registry.ts';

export type FormatOptionLabelContext = 'menu' | 'value';
export interface FormatOptionLabelMeta<Option> {
	context: FormatOptionLabelContext;
	inputValue: string;
	selectValue: Options<Option>;
}

export interface SelectProps<
	Option = unknown,
	IsMulti extends boolean = false,
	Group extends GroupBase<Option> = GroupBase<Option>,
> {
	ref?: Ref<SelectInstance<Option, IsMulti, Group>>;
	'aria-errormessage'?: string;
	'aria-invalid'?: boolean | 'false' | 'true' | 'grammar' | 'spelling';
	'aria-label'?: string;
	'aria-labelledby'?: string;
	'aria-live'?: 'off' | 'polite' | 'assertive';
	ariaLiveMessages?: AriaLiveMessages<Option, IsMulti, Group>;
	autoFocus?: boolean;
	backspaceRemovesValue?: boolean;
	blurInputOnSelect?: boolean;
	captureMenuScroll?: boolean;
	className?: string;
	classNamePrefix?: string | null;
	classNames?: ClassNamesConfig<Option, IsMulti, Group>;
	closeMenuOnSelect?: boolean;
	closeMenuOnScroll?: boolean | ((event: Event) => boolean);
	components?: SelectComponentsConfig<Option, IsMulti, Group>;
	controlShouldRenderValue?: boolean;
	delimiter?: string;
	escapeClearsValue?: boolean;
	filterOption?: ((option: FilterOptionOption<Option>, inputValue: string) => boolean) | null;
	formatGroupLabel?: (group: Group) => OctaneNode;
	formatOptionLabel?: (data: Option, meta: FormatOptionLabelMeta<Option>) => OctaneNode;
	form?: string;
	getOptionLabel?: GetOptionLabel<Option>;
	getOptionValue?: GetOptionValue<Option>;
	hideSelectedOptions?: boolean;
	id?: string;
	inputId?: string;
	inputValue?: string;
	instanceId?: number | string;
	isClearable?: boolean;
	isDisabled?: boolean;
	isLoading?: boolean;
	isMulti?: IsMulti;
	isOptionDisabled?: (option: Option, selectValue: Options<Option>) => boolean;
	isOptionSelected?: (option: Option, selectValue: Options<Option>) => boolean;
	isRtl?: boolean;
	isSearchable?: boolean;
	loadingMessage?: (value: { inputValue: string }) => OctaneNode;
	maxMenuHeight?: number;
	menuIsOpen?: boolean;
	menuPlacement?: 'auto' | 'bottom' | 'top';
	menuPortalTarget?: HTMLElement | null;
	menuPosition?: 'absolute' | 'fixed';
	menuShouldBlockScroll?: boolean;
	menuShouldScrollIntoView?: boolean;
	minMenuHeight?: number;
	name?: string;
	noOptionsMessage?: (value: { inputValue: string }) => OctaneNode;
	onBlur?: (event: FocusEvent) => void;
	onChange?: (value: OnChangeValue<Option, IsMulti>, actionMeta: ActionMeta<Option>) => void;
	onFocus?: (event: FocusEvent) => void;
	onInputChange?: (newValue: string, actionMeta: InputActionMeta) => void;
	onKeyDown?: (event: KeyboardEvent) => void;
	onMenuClose?: () => void;
	onMenuOpen?: () => void;
	onMenuScrollToBottom?: (event: WheelEvent | TouchEvent) => void;
	onMenuScrollToTop?: (event: WheelEvent | TouchEvent) => void;
	openMenuOnClick?: boolean;
	openMenuOnFocus?: boolean;
	options?: OptionsOrGroups<Option, Group>;
	pageSize?: number;
	placeholder?: OctaneNode;
	required?: boolean;
	screenReaderStatus?: (value: { count: number }) => string;
	styles?: StylesConfig<Option, IsMulti, Group>;
	tabIndex?: number;
	tabSelectsValue?: boolean;
	theme?: ThemeConfig;
	unstyled?: boolean;
	value?: PropsValue<Option>;
}

// `react-select/base` exposes the class-level Props contract, before React's
// `JSX.LibraryManagedAttributes` makes defaulted members optional. Keep the
// renderer-facing SelectProps permissive while publishing the same raw shape.
export type RawSelectRequiredPropKeys =
	| 'backspaceRemovesValue'
	| 'blurInputOnSelect'
	| 'captureMenuScroll'
	| 'classNames'
	| 'closeMenuOnSelect'
	| 'closeMenuOnScroll'
	| 'components'
	| 'controlShouldRenderValue'
	| 'escapeClearsValue'
	| 'filterOption'
	| 'formatGroupLabel'
	| 'getOptionLabel'
	| 'getOptionValue'
	| 'inputValue'
	| 'isDisabled'
	| 'isLoading'
	| 'isOptionDisabled'
	| 'isMulti'
	| 'isRtl'
	| 'isSearchable'
	| 'loadingMessage'
	| 'maxMenuHeight'
	| 'menuIsOpen'
	| 'menuPlacement'
	| 'menuPosition'
	| 'menuShouldBlockScroll'
	| 'menuShouldScrollIntoView'
	| 'minMenuHeight'
	| 'noOptionsMessage'
	| 'onChange'
	| 'onInputChange'
	| 'onMenuClose'
	| 'onMenuOpen'
	| 'openMenuOnClick'
	| 'openMenuOnFocus'
	| 'options'
	| 'pageSize'
	| 'placeholder'
	| 'screenReaderStatus'
	| 'styles'
	| 'tabIndex'
	| 'tabSelectsValue'
	| 'unstyled'
	| 'value';

export type RawSelectProps<Option, IsMulti extends boolean, Group extends GroupBase<Option>> =
	Omit<SelectProps<Option, IsMulti, Group>, RawSelectRequiredPropKeys> & Required<
		Pick<SelectProps<Option, IsMulti, Group>, RawSelectRequiredPropKeys>
	>;

export interface SelectInstance<
	Option = unknown,
	IsMulti extends boolean = false,
	Group extends GroupBase<Option> = GroupBase<Option>,
> {
	blur(): void;
	buildCategorizedOptions(): CategorizedGroupOrOption<Option, Group>[];
	buildFocusableOptions(): Option[];
	clearValue(): void;
	focus(): void;
	focusOption(direction?: FocusDirection): void;
	focusValue(direction: 'previous' | 'next'): void;
	getClassNames(name: string, componentProps: unknown): string | undefined;
	getComponents(): SelectComponents<Option, IsMulti, Group>;
	getOptionLabel(option: Option): string;
	getOptionValue(option: Option): string;
	getStyles(name: string, componentProps: unknown): CSSObjectWithLabel;
	getValue(): Options<Option>;
	openMenu(direction: 'first' | 'last'): void;
	popValue(): void;
	removeValue(option: Option): void;
	selectOption(option: Option): void;
	setValue(value: OnChangeValue<Option, IsMulti>, action: SetValueAction, option?: Option): void;
}

function isTouchCapable() {
	try {
		document.createEvent('TouchEvent');
		return true;
	} catch {
		return false;
	}
}

export const defaultProps = {
	'aria-live': 'polite' as const,
	backspaceRemovesValue: true,
	blurInputOnSelect: isTouchCapable(),
	captureMenuScroll: !isTouchCapable(),
	classNames: {},
	closeMenuOnSelect: true,
	closeMenuOnScroll: false,
	components: {},
	controlShouldRenderValue: true,
	escapeClearsValue: false,
	filterOption: createFilter(),
	formatGroupLabel: formatGroupLabelBuiltin,
	getOptionLabel: getOptionLabelBuiltin,
	getOptionValue: getOptionValueBuiltin,
	isDisabled: false,
	isLoading: false,
	isMulti: false,
	isRtl: false,
	isSearchable: true,
	isOptionDisabled: isOptionDisabledBuiltin,
	loadingMessage: () => 'Loading...',
	maxMenuHeight: 300,
	minMenuHeight: 140,
	menuIsOpen: false,
	menuPlacement: 'bottom' as const,
	menuPosition: 'absolute' as const,
	menuShouldBlockScroll: false,
	menuShouldScrollIntoView: true,
	noOptionsMessage: () => 'No options',
	openMenuOnFocus: false,
	openMenuOnClick: true,
	options: [],
	pageSize: 5,
	placeholder: 'Select...',
	screenReaderStatus: ({ count }: { count: number }) => `${count} result${
		count !== 1 ? 's' : ''
	} available`,
	styles: {},
	tabIndex: 0,
	tabSelectsValue: true,
	unstyled: false,
};

export interface CategorizedOption<Option> {
	type: 'option';
	data: Option;
	isDisabled: boolean;
	isSelected: boolean;
	label: string;
	value: string;
	index: number;
}

export interface CategorizedGroup<Option, Group extends GroupBase<Option>> {
	type: 'group';
	data: Group;
	options: readonly CategorizedOption<Option>[];
	index: number;
}

export type CategorizedGroupOrOption<Option, Group extends GroupBase<Option>> =
	CategorizedGroup<Option, Group> | CategorizedOption<Option>;

function isSelected<Option, IsMulti extends boolean, Group extends GroupBase<Option>>(
	props: RequiredSelectProps<Option, IsMulti, Group>,
	option: Option,
	selectValue: Options<Option>,
) {
	if (selectValue.indexOf(option) > -1) return true;
	if (props.isOptionSelected) return props.isOptionSelected(option, selectValue);
	const candidate = props.getOptionValue(option);
	return selectValue.some((value) => props.getOptionValue(value) === candidate);
}

type RequiredSelectProps<Option, IsMulti extends boolean, Group extends GroupBase<Option>> =
	SelectProps<Option, IsMulti, Group> & {
		'aria-live': 'off' | 'polite' | 'assertive';
		captureMenuScroll: boolean;
		classNames: ClassNamesConfig<Option, IsMulti, Group>;
		closeMenuOnSelect: boolean;
		closeMenuOnScroll: boolean | ((event: Event) => boolean);
		components: SelectComponentsConfig;
		controlShouldRenderValue: boolean;
		filterOption: ((option: FilterOptionOption<Option>, inputValue: string) => boolean) | null;
		formatGroupLabel: (group: Group) => OctaneNode;
		getOptionLabel: GetOptionLabel<Option>;
		getOptionValue: GetOptionValue<Option>;
		inputValue: string;
		isDisabled: boolean;
		isLoading: boolean;
		isMulti: IsMulti;
		isOptionDisabled: (option: Option, selectValue: Options<Option>) => boolean;
		isRtl: boolean;
		loadingMessage: (value: { inputValue: string }) => OctaneNode;
		maxMenuHeight: number;
		menuIsOpen: boolean;
		menuPlacement: 'auto' | 'bottom' | 'top';
		menuPosition: 'absolute' | 'fixed';
		menuShouldBlockScroll: boolean;
		menuShouldScrollIntoView: boolean;
		minMenuHeight: number;
		noOptionsMessage: (value: { inputValue: string }) => OctaneNode;
		onChange: (value: OnChangeValue<Option, IsMulti>, actionMeta: ActionMeta<Option>) => void;
		onInputChange: (newValue: string, actionMeta: InputActionMeta) => void;
		onMenuClose: () => void;
		onMenuOpen: () => void;
		openMenuOnClick: boolean;
		options: OptionsOrGroups<Option, Group>;
		pageSize: number;
		placeholder: OctaneNode;
		screenReaderStatus: (value: { count: number }) => string;
		styles: StylesConfig<Option, IsMulti, Group>;
		tabIndex: number;
		tabSelectsValue: boolean;
		unstyled: boolean;
	};

export function buildCategorizedOptions<
	Option,
	IsMulti extends boolean,
	Group extends GroupBase<Option>,
>(
	props: RequiredSelectProps<Option, IsMulti, Group>,
	selectValue: Options<Option>,
): CategorizedGroupOrOption<Option, Group>[] {
	const hideSelected = props.hideSelectedOptions ?? props.isMulti;
	const categorize = (option: Option, index: number): CategorizedOption<Option> => ({
		type: 'option',
		data: option,
		isDisabled: props.isOptionDisabled(option, selectValue),
		isSelected: isSelected(props, option, selectValue),
		label: props.getOptionLabel(option),
		value: props.getOptionValue(option),
		index,
	});
	const focusable = (option: CategorizedOption<Option>) =>
		(!hideSelected || !option.isSelected) &&
			(props.filterOption
				? props.filterOption(
						{ label: option.label, value: option.value, data: option.data },
						props.inputValue ?? '',
					)
				: true);
	const result: CategorizedGroupOrOption<Option, Group>[] = [];
	props.options.forEach((item, outerIndex) => {
		if (typeof item === 'object' && item !== null && 'options' in item) {
			const options = item.options.map(categorize).filter(focusable);
			if (options.length) result.push({ type: 'group', data: item, options, index: outerIndex });
			return;
		}
		const option = categorize(item as Option, outerIndex);
		if (focusable(option)) result.push(option);
	});
	return result;
}

function buildFocusableOptionsFromCategorized<Option, Group extends GroupBase<Option>>(
	categorized: readonly CategorizedGroupOrOption<Option, Group>[],
): Option[] {
	const options: Option[] = [];
	for (const item of categorized) {
		if (item.type === 'option') {
			options.push(item.data);
			continue;
		}
		for (const option of item.options) options.push(option.data);
	}
	return options;
}

function getNextFocusedValue<Option>(
	focusedValue: Option | null,
	lastSelectValue: Options<Option>,
	nextSelectValue: Options<Option>,
): Option | null {
	if (!focusedValue) return null;
	const lastFocusedIndex = lastSelectValue.indexOf(focusedValue);
	if (lastFocusedIndex > -1) {
		const nextFocusedIndex = nextSelectValue.indexOf(focusedValue);
		if (nextFocusedIndex > -1) return focusedValue;
		if (lastFocusedIndex < nextSelectValue.length) return nextSelectValue[lastFocusedIndex];
	}
	return null;
}

let nextInstanceId = 1;

const a11yTextStyle = {
	zIndex: 9999,
	border: 0,
	clip: 'rect(1px, 1px, 1px, 1px)',
	height: 1,
	width: 1,
	position: 'absolute',
	overflow: 'hidden',
	padding: 0,
	whiteSpace: 'nowrap',
	label: 'a11yText',
} as const;

const dummyInputStyle = {
	label: 'dummyInput',
	background: 0,
	border: 0,
	caretColor: 'transparent',
	fontSize: 'inherit',
	gridArea: '1 / 1 / 2 / 3',
	outline: 0,
	padding: 0,
	width: 1,
	color: 'transparent',
	left: -100,
	opacity: 0,
	position: 'relative',
	transform: 'scale(.01)',
} as const;

const requiredInputStyle = {
	label: 'requiredInput',
	opacity: 0,
	pointerEvents: 'none',
	position: 'absolute',
	bottom: 0,
	left: 0,
	right: 0,
	width: '100%',
} as const;

const scrollBlockerStyle = {
	position: 'fixed',
	left: 0,
	bottom: 0,
	right: 0,
	top: 0,
} as const;

const defaultAriaLiveMessages = {
	guidance(props: {
		'aria-label': string | undefined;
		context: 'menu' | 'input' | 'value';
		isSearchable: boolean;
		isMulti: boolean;
		tabSelectsValue: boolean;
		isInitialFocus: boolean;
	}) {
		if (props.context === 'menu') {
			return `Use Up and Down to choose options, press Enter to select the currently focused option, press Escape to exit the menu${
				props.tabSelectsValue ? ', press Tab to select the option and exit the menu' : ''
			}.`;
		}
		if (props.context === 'value') {
			return 'Use left and right to toggle between focused values, press Backspace to remove the currently focused value';
		}
		return props.isInitialFocus
			? `${props['aria-label'] || 'Select'} is focused ${
					props.isSearchable ? ',type to refine list' : ''
				}, press Down to open the menu, ${
					props.isMulti ? ' press left to focus selected values' : ''
				}`
			: '';
	},
	onChange(props: { action: string; label?: string; labels: string[]; isDisabled: boolean }) {
		if (props.action === 'clear') return 'All selected options have been cleared.';
		if (['deselect-option', 'pop-value', 'remove-value'].includes(props.action)) {
			return `option ${props.label || ''}, deselected.`;
		}
		if (props.action === 'initial-input-focus') {
			return `option${props.labels.length > 1 ? 's' : ''} ${props.labels.join(',')}, selected.`;
		}
		if (props.action === 'select-option') {
			return props.isDisabled
				? `option ${props.label || ''} is disabled. Select another option.`
				: `option ${props.label || ''}, selected.`;
		}
		return '';
	},
	onFocus<Option>(props: {
		context: 'menu' | 'value';
		focused: Option;
		label: string;
		options: readonly Option[];
		selectValue: readonly Option[];
		isDisabled: boolean;
		isSelected: boolean;
		isAppleDevice: boolean;
	}) {
		const index = (values: readonly Option[]) => values.length
			? `${values.indexOf(props.focused) + 1} of ${values.length}`
			: '';
		if (props.context === 'value') {
			return `value ${props.label} focused, ${index(props.selectValue)}.`;
		}
		if (props.isAppleDevice) {
			return `${props.label}${props.isSelected ? ' selected' : ''}${
				props.isDisabled ? ' disabled' : ''
			}, ${index(props.options)}.`;
		}
		return '';
	},
	onFilter(props: { inputValue: string; resultsMessage: string }) {
		return `${props.resultsMessage}${
			props.inputValue ? ` for search term ${props.inputValue}` : ''
		}.`;
	},
};

function LiveRegion<Option, IsMulti extends boolean, Group extends GroupBase<Option>>(props: {
	id: string;
	isFocused: boolean;
	focusedOption: Option | null;
	focusedValue: Option | null;
	focusableOptions: readonly Option[];
	selectValue: readonly Option[];
	selectProps: RequiredSelectProps<Option, IsMulti, Group>;
	ariaSelection: AriaSelection<Option, IsMulti> | null;
	isAppleDevice: boolean;
}) @{
	const resolveStyle = useStyleResolver();
	const resolved = resolveStyle(a11yTextStyle);
	const messages = { ...defaultAriaLiveMessages, ...props.selectProps.ariaLiveMessages };
	const selection = props.ariaSelection as
		| (AriaSelection<Option, IsMulti> & {
				option?: Option;
				removedValue?: Option;
				removedValues?: readonly Option[];
				options?: readonly Option[];
		  })
		| null;
	const selected =
		selection?.removedValue ?? selection?.option ??
			(selection && !Array.isArray(selection.value) ? selection.value as Option : undefined);
	const selectedMany = selection?.options ?? selection?.removedValues;
	const ariaSelected =
		selection && messages.onChange
			? messages.onChange(
					{
						...selection,
						isDisabled: selected
							? props.selectProps.isOptionDisabled(selected, props.selectValue)
							: false,
						label: selected ? props.selectProps.getOptionLabel(selected) : '',
						labels: selectedMany ? selectedMany.map(props.selectProps.getOptionLabel) : [],
					} as never,
				)
			: '';
	const focused = props.focusedOption ?? props.focusedValue;
	const ariaFocused =
		focused && messages.onFocus
			? messages.onFocus(
					{
						context: focused === props.focusedOption ? 'menu' : 'value',
						focused,
						isDisabled: props.selectProps.isOptionDisabled(focused, props.selectValue),
						isSelected: Boolean(
							props.focusedOption && props.selectValue.includes(props.focusedOption),
						),
						label: props.selectProps.getOptionLabel(focused),
						options: props.focusableOptions,
						selectValue: props.selectValue,
						isAppleDevice: props.isAppleDevice,
					} as never,
				)
			: '';
	const ariaResults =
		props.selectProps.menuIsOpen && props.selectProps.options.length &&
		!props.selectProps.isLoading &&
		messages.onFilter
			? messages.onFilter({
					inputValue: props.selectProps.inputValue,
					resultsMessage: props.selectProps.screenReaderStatus({
						count: props.focusableOptions.length,
					}),
				})
			: '';
	const isInitialFocus = selection?.action === 'initial-input-focus';
	const context =
		props.focusedValue
			? 'value'
			: props.selectProps.menuIsOpen
				? 'menu'
				: 'input';
	const ariaGuidance =
		messages.guidance?.(
			{
				'aria-label': props.selectProps['aria-label'],
				context,
				isDisabled: props.focusedOption
					? props.selectProps.isOptionDisabled(props.focusedOption, props.selectValue)
					: false,
				isMulti: Boolean(props.selectProps.isMulti),
				isSearchable: props.selectProps.isSearchable,
				tabSelectsValue: props.selectProps.tabSelectsValue,
				isInitialFocus,
			} as never,
		) ??
			'';
	const screenReaderText = <>
		<span id="aria-selection">{ariaSelected}</span>
		<span id="aria-focused">{ariaFocused}</span>
		<span id="aria-results">{ariaResults}</span>
		<span id="aria-guidance">{ariaGuidance}</span>
	</>;
	<>
		<span id={props.id} className={resolved.className}>
			{isInitialFocus ? screenReaderText : null}
		</span>
		<span
			aria-live={props.selectProps['aria-live']}
			aria-atomic="false"
			aria-relevant="additions text"
			role="log"
			className={resolved.className}
		>
			{props.isFocused && !isInitialFocus ? screenReaderText : null}
		</span>
	</>
}

function isAppleDevice() {
	if (typeof window === 'undefined' || window.navigator == null) return false;
	const platform = window.navigator.platform;
	const isMac = /^Mac/i.test(platform);
	return /^iPhone|^iPad/i.test(platform) || isMac && navigator.maxTouchPoints > 1 || isMac;
}

export function Select<
	Option = unknown,
	IsMulti extends boolean = false,
	Group extends GroupBase<Option> = GroupBase<Option>,
>(inputProps: SelectProps<Option, IsMulti, Group>) @{
	const props = { ...defaultProps, ...inputProps } as RequiredSelectProps<Option, IsMulti, Group>;
	const selectValue = cleanValue(props.value ?? null);
	const categorized = buildCategorizedOptions(props, selectValue);
	const focusableOptions = buildFocusableOptionsFromCategorized(categorized);
	function initialFocusedOption(): Option | null {
		if (!props.menuIsOpen) return null;
		if (!selectValue.length) return null;
		return focusableOptions.includes(selectValue[0]) ? selectValue[0] : null;
	}
	const [instancePrefix] = useState(() => `react-select-${props.instanceId ?? nextInstanceId++}`);
	const [isFocused, setIsFocused] = useState(false);
	const [isComposing, setIsComposing] = useState(false);
	const [inputIsHidden, setInputIsHidden] = useState(false);
	const [appleDevice, setAppleDevice] = useState(false);
	const [focusedOption, setFocusedOption] = useState<Option | null>(initialFocusedOption);
	const [focusedValue, setFocusedValue] = useState<Option | null>(null);
	const clearFocusValueOnUpdateRef = useRef(false);
	const prevSelectValueRef = useRef(selectValue);
	const prevFocusReconcileRef = useRef({
		options: props.options,
		value: props.value,
		menuIsOpen: props.menuIsOpen,
		inputValue: props.inputValue,
	});
	const [ariaSelection, setAriaSelection] = useState<AriaSelection<Option, IsMulti> | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const controlRef = useRef<HTMLDivElement | null>(null);
	const initialTouch = useRef({ x: 0, y: 0 });
	const userIsDragging = useRef(false);
	const blockOptionHover = useRef(false);
	const initialFocusPass = useRef(selectValue.length > 0);
	const menuRef = useRef<HTMLDivElement | null>(null);
	const menuListRef = useRef<HTMLDivElement | null>(null);
	const focusedOptionRef = useRef<HTMLDivElement | null>(null);
	const [menuPlacement, setMenuPlacement] = useState<'bottom' | 'top'>(
		props.menuPlacement === 'top' ? 'top' : 'bottom',
	);
	const [menuMaxHeight, setMenuMaxHeight] = useState(props.maxMenuHeight);
	const theme: Theme = useMemo(() => {
		if (!props.theme) return defaultTheme;
		if (typeof props.theme === 'function') return props.theme(defaultTheme);
		return { ...defaultTheme, ...props.theme };
	}, [props.theme]);
	const resolveStyle = useStyleResolver();
	useScrollManager({
		enabled: props.menuIsOpen,
		captureEnabled: props.captureMenuScroll,
		lockEnabled: props.menuShouldBlockScroll,
		target: menuListRef,
		onBottomArrive: props.onMenuScrollToBottom,
		onTopArrive: props.onMenuScrollToTop,
	});
	useLayoutEffect(() => {
		if (!props.menuIsOpen || !menuRef.current) return;
		const next = getMenuPlacement({
			maxHeight: props.maxMenuHeight,
			menuEl: menuRef.current,
			minHeight: props.minMenuHeight,
			placement: props.menuPlacement,
			shouldScroll: props.menuShouldScrollIntoView && props.menuPosition !== 'fixed',
			isFixedPosition: props.menuPosition === 'fixed',
			controlHeight: theme.spacing.controlHeight,
		});
		setMenuPlacement(next.placement);
		setMenuMaxHeight(next.maxHeight);
	}, [
		props.maxMenuHeight,
		props.menuIsOpen,
		props.menuPlacement,
		props.menuPosition,
		props.menuShouldScrollIntoView,
		props.minMenuHeight,
	]);
	useEffect(() => {
		if (props.autoFocus) inputRef.current?.focus();
	}, []);
	useEffect(() => {
		if (isAppleDevice()) setAppleDevice(true);
	}, []);
	useEffect(() => {
		if (initialFocusPass.current) {
			initialFocusPass.current = false;
			return;
		}
		if (!props.menuIsOpen) {
			if (focusedOption !== null) setFocusedOption(null);
			return;
		}
		const nextFocusedOption =
			focusedOption && focusableOptions.includes(focusedOption)
				? focusedOption
				: focusableOptions[0] ?? null;
		if (nextFocusedOption !== focusedOption) setFocusedOption(nextFocusedOption);
	}, [props.options, props.value, props.menuIsOpen, props.inputValue, focusedOption]);
	useEffect(() => {
		const prev = prevFocusReconcileRef.current;
		const changed =
			props.value !== prev.value || props.options !== prev.options ||
				props.menuIsOpen !== prev.menuIsOpen ||
				props.inputValue !== prev.inputValue;
		if (!changed) return;
		prevFocusReconcileRef.current = {
			options: props.options,
			value: props.value,
			menuIsOpen: props.menuIsOpen,
			inputValue: props.inputValue,
		};
		const lastSelectValue = prevSelectValueRef.current;
		prevSelectValueRef.current = selectValue;
		const nextFocusedValue =
			clearFocusValueOnUpdateRef.current
				? getNextFocusedValue(focusedValue, lastSelectValue, selectValue)
				: null;
		clearFocusValueOnUpdateRef.current = false;
		if (nextFocusedValue !== focusedValue) setFocusedValue(nextFocusedValue);
	}, [props.options, props.value, props.menuIsOpen, props.inputValue, selectValue, focusedValue]);
	useLayoutEffect(() => {
		if (!props.menuIsOpen || !menuListRef.current || !focusedOptionRef.current) return;
		scrollOptionIntoView(menuListRef.current, focusedOptionRef.current);
	}, [props.menuIsOpen, focusedOption]);
	const Components = defaultComponents({ components: props.components });
	const inspectableValueChildren = needsInspectableValueChildren(Components.ValueContainer);
	const elementId = (part: string) => `${instancePrefix}-${part}`;
	const getStyles = (name: string, componentProps: unknown) => {
		const key = name as StyleKey;
		const base = defaultStyles[key](componentProps as never, props.unstyled);
		base.boxSizing = 'border-box';
		return props.styles[key]?.(base, componentProps) ?? base;
	};
	const getClassNames = (name: string, componentProps: unknown) =>
		props.classNames[name as StyleKey]?.(componentProps);
	const cx = (state: Record<string, boolean>, ...names: (string | undefined)[]) => classNames(
		props.classNamePrefix,
		state,
		...names,
	);

	const closeMenu = () => {
		props.onInputChange('', {
			action: 'menu-close',
			prevInputValue: props.inputValue ?? '',
		});
		props.onMenuClose();
		setFocusedOption(null);
	};
	useEffect(() => {
		if (!props.closeMenuOnScroll || typeof document === 'undefined') return;
		const onScroll = (event: Event) => {
			if (typeof props.closeMenuOnScroll === 'function') {
				if (props.closeMenuOnScroll(event)) props.onMenuClose();
				return;
			}
			const target = event.target;
			if (
				target instanceof HTMLElement &&
					(target === document.documentElement || target === document.body)
			) props.onMenuClose();
		};
		document.addEventListener('scroll', onScroll, true);
		return () => document.removeEventListener('scroll', onScroll, true);
	}, [props.closeMenuOnScroll, props.onMenuClose]);
	useEffect(() => {
		if (typeof document === 'undefined') return;
		const onTouchStart = (event: TouchEvent) => {
			const touch = event.touches.item(0);
			if (!touch) return;
			initialTouch.current = { x: touch.clientX, y: touch.clientY };
			userIsDragging.current = false;
		};
		const onTouchMove = (event: TouchEvent) => {
			const touch = event.touches.item(0);
			if (!touch) return;
			userIsDragging.current = Math.abs(touch.clientX - initialTouch.current.x) > 5 ||
				Math.abs(touch.clientY - initialTouch.current.y) > 5;
		};
		const onTouchEnd = (event: TouchEvent) => {
			if (!userIsDragging.current) {
				const target = event.target as Node;
				if (
					controlRef.current && !controlRef.current.contains(target) && menuListRef.current &&
						!menuListRef.current.contains(target)
				) inputRef.current?.blur();
			}
			initialTouch.current = { x: 0, y: 0 };
		};
		document.addEventListener('touchstart', onTouchStart);
		document.addEventListener('touchmove', onTouchMove);
		document.addEventListener('touchend', onTouchEnd);
		return () => {
			document.removeEventListener('touchstart', onTouchStart);
			document.removeEventListener('touchmove', onTouchMove);
			document.removeEventListener('touchend', onTouchEnd);
		};
	}, []);
	const setValue = (
		newValue: OnChangeValue<Option, IsMulti>,
		action: SetValueAction,
		option?: Option,
	) => {
		props.onInputChange('', {
			action: 'set-value',
			prevInputValue: props.inputValue ?? '',
		});
		if (props.closeMenuOnSelect) closeMenu();
		if (props.closeMenuOnSelect) setInputIsHidden(!props.isMulti);
		const actionMeta = { action, option, name: props.name } as ActionMeta<Option>;
		setAriaSelection({ ...actionMeta, value: newValue } as AriaSelection<Option, IsMulti>);
		clearFocusValueOnUpdateRef.current = true;
		props.onChange(newValue, actionMeta);
	};
	const selectOption = (option: Option) => {
		const optionIsSelected = isSelected(props, option, selectValue);
		if (props.isMulti && optionIsSelected) {
			setValue(
				selectValue.filter(
					(value) => props.getOptionValue(value) !== props.getOptionValue(option),
				) as OnChangeValue<Option, IsMulti>,
				'deselect-option',
				option,
			);
		} else if (props.isOptionDisabled(option, selectValue)) {
			setAriaSelection(
				{
					action: 'select-option',
					option,
					name: props.name,
					value: option,
				} as AriaSelection<Option, IsMulti>,
			);
			return;
		} else if (props.isMulti) {
			setValue([...selectValue, option] as OnChangeValue<Option, IsMulti>, 'select-option', option);
		} else {
			setValue(option as OnChangeValue<Option, IsMulti>, 'select-option');
		}
		if (props.blurInputOnSelect) inputRef.current?.blur();
	};
	const clearValue = () => {
		const newValue = valueTernary(props.isMulti, [], null as Option) as OnChangeValue<
			Option,
			IsMulti
		>;
		const actionMeta = {
			action: 'clear',
			removedValues: selectValue,
			name: props.name,
		} as ActionMeta<Option>;
		setAriaSelection({ ...actionMeta, value: newValue } as AriaSelection<Option, IsMulti>);
		props.onChange(newValue, actionMeta);
	};
	const removeValue = (removedValue: Option) => {
		const candidate = props.getOptionValue(removedValue);
		const newValue = selectValue.filter((value) => props.getOptionValue(value) !== candidate);
		const nextValue = valueTernary(
			props.isMulti,
			newValue,
			newValue[0] ?? null as Option,
		) as OnChangeValue<Option, IsMulti>;
		const actionMeta = {
			action: 'remove-value',
			removedValue,
			name: props.name,
		} as ActionMeta<Option>;
		setAriaSelection({ ...actionMeta, value: nextValue } as AriaSelection<Option, IsMulti>);
		setFocusedValue(null);
		setInputIsHidden(false);
		props.onChange(nextValue, actionMeta);
	};
	const popValue = () => {
		const removedValue = selectValue[selectValue.length - 1];
		if (!removedValue) return;
		const newValue = selectValue.slice(0, -1);
		const nextValue = valueTernary(
			props.isMulti,
			newValue,
			newValue[0] ?? null as Option,
		) as OnChangeValue<Option, IsMulti>;
		const actionMeta = {
			action: 'pop-value',
			removedValue,
			name: props.name,
		} as ActionMeta<Option>;
		setAriaSelection({ ...actionMeta, value: nextValue } as AriaSelection<Option, IsMulti>);
		props.onChange(nextValue, actionMeta);
	};
	const commonProps = {
		clearValue,
		cx,
		getStyles,
		getClassNames,
		getValue: () => selectValue,
		hasValue: selectValue.length > 0,
		isMulti: Boolean(props.isMulti),
		isRtl: props.isRtl,
		options: props.options,
		selectOption,
		selectProps: props as unknown as { controlShouldRenderValue: boolean } & Record<
			string,
			unknown
		>,
		setValue,
		theme,
	};

	const focusOption = (direction: FocusDirection = 'first') => {
		if (!focusableOptions.length) return;
		if (ariaSelection?.action === 'initial-input-focus') setAriaSelection(null);
		const current =
			focusedOption ? focusableOptions.indexOf(focusedOption) : -1;
		const index =
			direction === 'first'
				? 0
				: direction === 'last'
					? focusableOptions.length - 1
					: direction === 'pageup'
						? Math.max(current - props.pageSize, 0)
						: direction === 'pagedown'
							? Math.min(current + props.pageSize, focusableOptions.length - 1)
							: direction === 'down'
								? (current + 1) % focusableOptions.length
								: current > 0
									? current - 1
									: focusableOptions.length - 1;
		setFocusedValue(null);
		setFocusedOption(focusableOptions[index]);
	};

	const focusValue = (direction: 'previous' | 'next') => {
		if (!props.isMulti || !selectValue.length) return;
		if (ariaSelection?.action === 'initial-input-focus') setAriaSelection(null);
		const current =
			focusedValue ? selectValue.indexOf(focusedValue) : -1;
		const next =
			direction === 'previous'
				? current === 0
					? 0
					: current === -1
						? selectValue.length - 1
						: current - 1
				: current > -1 && current < selectValue.length - 1
					? current + 1
					: -1;
		setFocusedOption(null);
		setFocusedValue(next === -1 ? null : selectValue[next]);
		setInputIsHidden(next !== -1);
	};

	const openMenu = (direction: 'first' | 'last') => {
		if (ariaSelection?.action === 'initial-input-focus') setAriaSelection(null);
		setFocusedValue(null);
		const selectedIndex =
			!props.isMulti && selectValue.length ? focusableOptions.indexOf(selectValue[0]) : -1;
		setFocusedOption(
			focusableOptions[selectedIndex > -1
				? selectedIndex
				: direction === 'first'
					? 0
					: focusableOptions.length - 1] ??
				null,
		);
		props.onMenuOpen();
	};
	useImperativeHandle(
		props.ref,
		() => ({
			blur: () => inputRef.current?.blur(),
			buildCategorizedOptions: () => categorized,
			buildFocusableOptions: () => focusableOptions,
			clearValue,
			focus: () => inputRef.current?.focus(),
			focusOption,
			focusValue,
			getClassNames,
			getComponents: () => Components,
			getOptionLabel: props.getOptionLabel,
			getOptionValue: props.getOptionValue,
			getStyles,
			getValue: () => selectValue,
			openMenu,
			popValue,
			removeValue,
			selectOption,
			setValue,
		}),
		[
			categorized,
			focusableOptions,
			props.getOptionLabel,
			props.getOptionValue,
			selectValue,
		],
	);

	const onKeyDown = (event: KeyboardEvent) => {
		props.onKeyDown?.(event);
		if (event.defaultPrevented || props.isDisabled) return;
		blockOptionHover.current = true;
		switch (event.key) {
			case 'ArrowLeft':
				if (!props.isMulti || props.inputValue) return;
				focusValue('previous');
				break;
			case 'ArrowRight':
				if (!props.isMulti || props.inputValue) return;
				focusValue('next');
				break;
			case 'ArrowDown':
				if (props.menuIsOpen) focusOption('down');
				else openMenu('first');
				break;
			case 'ArrowUp':
				if (props.menuIsOpen) focusOption('up');
				else openMenu('last');
				break;
			case 'PageUp':
				if (!props.menuIsOpen) return;
				focusOption('pageup');
				break;
			case 'PageDown':
				if (!props.menuIsOpen) return;
				focusOption('pagedown');
				break;
			case 'Home':
				if (props.menuIsOpen) focusOption('first');
				else return;
				break;
			case 'End':
				if (props.menuIsOpen) focusOption('last');
				else return;
				break;
			case 'Enter':
				if ((event as KeyboardEvent & { keyCode?: number }).keyCode === 229 || isComposing) break;
				if (props.menuIsOpen && focusedOption) selectOption(focusedOption);
				else return;
				break;
			case 'Escape':
				if (props.menuIsOpen) closeMenu();
				else if (props.isClearable && props.escapeClearsValue && selectValue.length) clearValue();
				else return;
				break;
			case 'Backspace':
			case 'Delete':
				if (props.inputValue) return;
				if (focusedValue) removeValue(focusedValue);
				else if (props.backspaceRemovesValue) {
					if (props.isMulti) popValue();
					else if (props.isClearable) clearValue();
				}
				break;
			case 'Tab':
				if (isComposing) return;
				if (
					!event.shiftKey && props.tabSelectsValue && props.menuIsOpen && focusedOption &&
						!(props.openMenuOnFocus && selectValue.includes(focusedOption))
				) selectOption(focusedOption);
				else return;
				break;
			case ' ':
				if (props.inputValue) return;
				if (!props.menuIsOpen) openMenu('first');
				else if (focusedOption) selectOption(focusedOption);
				else return;
				break;
			default:
				return;
		}
		event.preventDefault();
	};

	const formatOption = (option: Option, context: FormatOptionLabelContext) =>
		props.formatOptionLabel
			? props.formatOptionLabel(option, {
					context,
					inputValue: props.inputValue ?? '',
					selectValue,
				})
			: props.getOptionLabel(option);
	const handleControlPointerEnd = (event: MouseEvent | TouchEvent) => {
		if (event.defaultPrevented || props.isDisabled) return;
		const target = event.target as HTMLElement;
		if (!isFocused) {
			inputRef.current?.focus();
			if (props.openMenuOnClick) openMenu('first');
		} else if (!props.menuIsOpen) {
			if (props.openMenuOnClick) openMenu('first');
		} else if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
			closeMenu();
		}
		if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') event.preventDefault();
	};
	const handleDropdownPointerEnd = (event: MouseEvent | TouchEvent) => {
		if (event.type === 'mousedown' && (event as MouseEvent).button !== 0) return;
		if (props.isDisabled) return;
		inputRef.current?.focus();
		if (props.menuIsOpen) {
			setInputIsHidden(!props.isMulti);
			closeMenu();
		} else {
			openMenu('first');
		}
		event.preventDefault();
	};
	const handleClearPointerEnd = (event: MouseEvent | TouchEvent) => {
		if (event.type === 'mousedown' && (event as MouseEvent).button !== 0) return;
		clearValue();
		event.preventDefault();
		if (event.type === 'touchend') inputRef.current?.focus();
		else setTimeout(() => inputRef.current?.focus());
	};

	const valueUI =
		!selectValue.length || !props.controlShouldRenderValue
			? props.inputValue
				? null
				: <Components.Placeholder
						{...commonProps}
						key="placeholder"
						isDisabled={props.isDisabled}
						isFocused={isFocused}
						innerProps={{ id: elementId('placeholder') }}
					>{props.placeholder}</Components.Placeholder>
			: props.isMulti
				? selectValue.map(
						(option, index) => <Components.MultiValue
							{...commonProps}
							key={`${props.getOptionLabel(option)}-${props.getOptionValue(option)}`}
							components={{
								Container: Components.MultiValueContainer,
								Label: Components.MultiValueLabel,
								Remove: Components.MultiValueRemove,
							}}
							data={option}
							index={index}
							isDisabled={props.isDisabled}
							isFocused={focusedValue === option}
							removeProps={{
								onClick: () => removeValue(option),
								onMouseDown: (event: MouseEvent) => event.preventDefault(),
								onTouchEnd: () => {
									if (!userIsDragging.current) removeValue(option);
								},
							}}
						>{formatOption(option, 'value')}</Components.MultiValue>,
					)
				: props.inputValue
					? null
					: <Components.SingleValue
							{...commonProps}
							data={selectValue[0]}
							isDisabled={props.isDisabled}
						>{formatOption(selectValue[0], 'value')}</Components.SingleValue>;

	const inputId = props.inputId || elementId('input');
	const handleInputFocus = (event: FocusEvent) => {
		setInputIsHidden(false);
		setIsFocused(true);
		setAriaSelection(
			{
				action: 'initial-input-focus',
				value: valueTernary(props.isMulti, selectValue, selectValue[0] ?? null as Option),
				options: selectValue,
			} as AriaSelection<Option, IsMulti>,
		);
		props.onFocus?.(event);
		if (props.openMenuOnFocus) openMenu('first');
	};
	const handleInputBlur = (event: FocusEvent) => {
		if (menuListRef.current?.contains(document.activeElement)) {
			inputRef.current?.focus();
			return;
		}
		props.onBlur?.(event);
		props.onInputChange('', {
			action: 'input-blur',
			prevInputValue: props.inputValue ?? '',
		});
		closeMenu();
		setFocusedValue(null);
		setIsFocused(false);
	};
	const ariaDescribedBy =
		selectValue.length
			? ariaSelection?.action === 'initial-input-focus'
				? elementId('live-region')
				: undefined
			: elementId('placeholder');
	function focusedOptionId(): string {
		if (!focusedOption) return '';
		for (const item of categorized) {
			if (item.type === 'option') {
				if (item.data === focusedOption) return elementId(`option-${item.index}`);
				continue;
			}
			for (const option of item.options) {
				if (option.data === focusedOption) {
					return elementId(`option-${item.index}-${option.index}`);
				}
			}
		}
		return '';
	}
	const ariaActiveDescendant =
		appleDevice ? undefined : focusedOptionId();
	const commonInputAttributes: Omit<Octane.JSX.IntrinsicElements['input'], 'ref'> & {
		ref?: Octane.Ref<HTMLInputElement>;
	} = {
		id: inputId,
		disabled: props.isDisabled,
		onBlur: handleInputBlur,
		onFocus: handleInputFocus,
		tabIndex: props.tabIndex,
		form: props.form,
		'aria-autocomplete': 'list' as const,
		'aria-expanded': props.menuIsOpen,
		'aria-haspopup': 'true' as const,
		'aria-errormessage': props['aria-errormessage'],
		'aria-invalid': props['aria-invalid'],
		'aria-label': props['aria-label'],
		'aria-labelledby': props['aria-labelledby'],
		'aria-required': props.required,
		role: 'combobox',
		'aria-activedescendant': ariaActiveDescendant,
		'aria-controls': props.menuIsOpen ? elementId('listbox') : undefined,
		'aria-describedby': ariaDescribedBy,
		ref: inputRef,
	};
	const inputUI =
		!props.isSearchable
			? <input
					{...commonInputAttributes}
					className={resolveStyle(dummyInputStyle).className}
					inputMode="none"
					value=""
					onInput={() => {}}
					aria-readonly="true"
				/>
			: <Components.Input
					{...commonProps}
					autoCapitalize="none"
					autoComplete="off"
					autoCorrect="off"
					id={inputId}
					innerRef={inputRef}
					isDisabled={props.isDisabled}
					isHidden={inputIsHidden}
					onBlur={commonInputAttributes.onBlur}
					onInput={(event: InputEvent) => {
						const target = event.currentTarget as HTMLInputElement;
						setInputIsHidden(false);
						props.onInputChange(target.value, {
							action: 'input-change',
							prevInputValue: props.inputValue ?? '',
						});
						if (!props.menuIsOpen) props.onMenuOpen();
					}}
					onFocus={handleInputFocus}
					spellCheck="false"
					onCompositionStart={() => setIsComposing(true)}
					onCompositionEnd={() => setIsComposing(false)}
					tabIndex={props.tabIndex}
					form={props.form}
					type="text"
					value={props.inputValue ?? ''}
					aria-autocomplete="list"
					aria-expanded={props.menuIsOpen}
					aria-haspopup="true"
					aria-errormessage={props['aria-errormessage']}
					aria-invalid={props['aria-invalid']}
					aria-label={props['aria-label']}
					aria-labelledby={props['aria-labelledby']}
					aria-required={props.required}
					role="combobox"
					aria-activedescendant={ariaActiveDescendant}
					aria-controls={props.menuIsOpen ? elementId('listbox') : undefined}
					aria-describedby={ariaDescribedBy}
				/>;

	const onOptionHover = (option: Option) => {
		if (blockOptionHover.current || focusedOption === option) return;
		setFocusedOption(option);
	};
	const renderOption = (option: CategorizedOption<Option>, id: string) => {
		const optionIsFocused = focusedOption === option.data;
		const optionId = elementId(`option-${id}`);
		return <Components.Option
			{...commonProps}
			key={optionId}
			data={option.data}
			innerRef={optionIsFocused ? focusedOptionRef : null}
			innerProps={{
				id: optionId,
				onClick: option.isDisabled ? undefined : () => selectOption(option.data),
				onMouseMove: option.isDisabled ? undefined : () => onOptionHover(option.data),
				onMouseOver: option.isDisabled ? undefined : () => onOptionHover(option.data),
				onTouchEnd: option.isDisabled
					? undefined
					: () => {
							if (!userIsDragging.current) selectOption(option.data);
						},
				tabIndex: -1,
				role: 'option',
				'aria-selected': appleDevice ? undefined : option.isSelected,
			}}
			isDisabled={option.isDisabled}
			isFocused={optionIsFocused}
			isSelected={option.isSelected}
			label={option.label}
			type="option"
		>{formatOption(option.data, 'menu')}</Components.Option>;
	};

	let menuUI: OctaneNode = null;
	if (props.menuIsOpen) {
		const children =
			categorized.length
				? categorized.map(
						(item) => item.type === 'group'
							? <Components.Group
									{...commonProps}
									key={elementId(`group-${item.index}`)}
									Heading={Components.GroupHeading}
									data={item.data}
									headingProps={{
										id: `${elementId(`group-${item.index}`)}-heading`,
										data: item.data,
									}}
									label={props.formatGroupLabel(item.data)}
									options={item.options}
								>{item.options.map(
									(option) => renderOption(option, `${item.index}-${option.index}`),
								)}</Components.Group>
							: renderOption(item, String(item.index)),
					)
				: props.isLoading
					? props.loadingMessage({ inputValue: props.inputValue ?? '' })
					: props.noOptionsMessage({ inputValue: props.inputValue ?? '' });
		if (children === null) {
			menuUI = null;
		} else {
			const renderedChildren =
				categorized.length
					? children
					: props.isLoading
						? <Components.LoadingMessage {...commonProps}>{children}</Components.LoadingMessage>
						: <Components.NoOptionsMessage
								{...commonProps}
							>{children}</Components.NoOptionsMessage>;
			const menuElement = <Components.Menu
				{...commonProps}
				innerRef={menuRef}
				innerProps={{
					onMouseDown: (event: MouseEvent) => {
						event.stopPropagation();
						event.preventDefault();
					},
					onMouseMove: (event: MouseEvent) => {
						blockOptionHover.current = false;
						event.stopPropagation();
					},
				}}
				isLoading={props.isLoading}
				placement={menuPlacement}
				minMenuHeight={props.minMenuHeight}
				maxMenuHeight={menuMaxHeight}
				menuPlacement={props.menuPlacement}
				menuPosition={props.menuPosition}
				menuShouldScrollIntoView={props.menuShouldScrollIntoView}
			>
				<Components.MenuList
					{...commonProps}
					innerRef={menuListRef}
					innerProps={{
						role: 'listbox',
						'aria-multiselectable': Boolean(props.isMulti),
						id: elementId('listbox'),
					}}
					maxHeight={menuMaxHeight}
					focusedOption={focusedOption}
				>{renderedChildren}</Components.MenuList>
			</Components.Menu>;
			menuUI = props.menuPortalTarget || props.menuPosition === 'fixed'
				? <Components.MenuPortal
						{...commonProps}
						appendTo={props.menuPortalTarget ?? undefined}
						controlElement={controlRef.current}
						innerProps={{}}
						menuPlacement={menuPlacement}
						menuPosition={props.menuPosition}
					>{menuElement}</Components.MenuPortal>
				: menuElement;
			if (props.menuShouldBlockScroll) {
				const unlockedMenu = menuUI;
				menuUI = <>
					<div
						className={resolveStyle(scrollBlockerStyle).className}
						onClick={(event: MouseEvent) => {
							const target = event.target as HTMLElement;
							(target.ownerDocument.activeElement as HTMLElement | null)?.blur();
						}}
					/>
					{unlockedMenu}
				</>;
			}
		}
	}

	let formField: OctaneNode = null;
	if (props.required && !selectValue.length && !props.isDisabled) {
		formField = <input
			required={true}
			name={props.name}
			tabIndex={-1}
			aria-hidden="true"
			onFocus={(event: FocusEvent) => {
				event.preventDefault();
				event.stopPropagation();
				inputRef.current?.focus();
			}}
			className={resolveStyle(requiredInputStyle).className}
			value=""
			onInput={() => {}}
		/>;
	} else if (props.name && !props.isDisabled) {
		if (props.isMulti) {
			formField = props.delimiter
				? <input
						name={props.name}
						type="hidden"
						value={selectValue.map(props.getOptionValue).join(props.delimiter)}
					/>
				: <div>
						{selectValue.length
							? selectValue.map(
									(option, index) =>
										<input
											key={`i-${index}`}
											name={props.name}
											type="hidden"
											value={props.getOptionValue(option)}
										/>,
								)
							: <input name={props.name} type="hidden" value="" />}
					</div>;
		} else {
			formField = <input
				name={props.name}
				type="hidden"
				value={selectValue[0] ? props.getOptionValue(selectValue[0]) : ''}
			/>;
		}
	}
	<Components.SelectContainer
		{...commonProps}
		className={props.className}
		innerProps={{ id: props.id, onKeyDown }}
		isDisabled={props.isDisabled}
		isFocused={isFocused}
	>
		<LiveRegion
			id={elementId('live-region')}
			isFocused={isFocused}
			focusedOption={focusedOption}
			focusedValue={focusedValue}
			focusableOptions={focusableOptions}
			selectValue={selectValue}
			selectProps={props}
			ariaSelection={ariaSelection}
			isAppleDevice={appleDevice}
		/>
		<Components.Control
			{...commonProps}
			innerRef={controlRef}
			innerProps={{
				onMouseDown: handleControlPointerEnd,
				onTouchEnd: (event: TouchEvent) => {
					if (!userIsDragging.current) handleControlPointerEnd(event);
				},
			}}
			isDisabled={props.isDisabled}
			isFocused={isFocused}
			menuIsOpen={props.menuIsOpen}
		>
			@if (inspectableValueChildren) {
				<>
					{createElement(Components.ValueContainer, {
						...commonProps,
						isDisabled: props.isDisabled,
						children: props.isMulti && Array.isArray(valueUI)
							? [
									...valueUI,
									createElement(Fragment, { key: 'select-input', children: inputUI }),
								]
							: [
									createElement(Fragment, { key: 'select-value', children: valueUI }),
									createElement(Fragment, { key: 'select-input', children: inputUI }),
								],
					})}
				</>
			} @else {
				<Components.ValueContainer {...commonProps} isDisabled={props.isDisabled}>
					{valueUI}
					{inputUI}
				</Components.ValueContainer>
			}
			<Components.IndicatorsContainer {...commonProps} isDisabled={props.isDisabled}>
				{(props.isClearable ?? Boolean(props.isMulti)) && selectValue.length && !props.isDisabled &&
				!props.isLoading
					? <Components.ClearIndicator
							{...commonProps}
							innerProps={{
								'aria-hidden': 'true',
								onMouseDown: handleClearPointerEnd,
								onTouchEnd: (event: TouchEvent) => {
									if (!userIsDragging.current) handleClearPointerEnd(event);
								},
							}}
							isDisabled={props.isDisabled}
							isFocused={isFocused}
						/>
					: null}
				{props.isLoading
					? <Components.LoadingIndicator
							{...commonProps}
							innerProps={{ 'aria-hidden': 'true' }}
							isDisabled={props.isDisabled}
							isFocused={isFocused}
						/>
					: null}
				{Components.DropdownIndicator && Components.IndicatorSeparator
					? <Components.IndicatorSeparator
							{...commonProps}
							isDisabled={props.isDisabled}
							isFocused={isFocused}
						/>
					: null}
				{Components.DropdownIndicator
					? <Components.DropdownIndicator
							{...commonProps}
							innerProps={{
								'aria-hidden': 'true',
								onMouseDown: handleDropdownPointerEnd,
								onTouchEnd: (event: TouchEvent) => {
									if (!userIsDragging.current) handleDropdownPointerEnd(event);
								},
							}}
							isDisabled={props.isDisabled}
							isFocused={isFocused}
						/>
					: null}
			</Components.IndicatorsContainer>
		</Components.Control>
		{menuUI}
		{formField}
	</Components.SelectContainer>
}

export type PublicBaseSelectProps<
	Option,
	IsMulti extends boolean,
	Group extends GroupBase<Option>,
> =
	SelectProps<Option, IsMulti, Group>;

export const baseComponents = builtinComponents;
