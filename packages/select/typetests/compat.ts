// OCTANE DIVERGENCE[react-select-octane-node][types:octane-node-adaptation]: renderer-owned renderable contracts use OctaneNode instead of ReactNode.
// OCTANE DIVERGENCE[react-select-native-events][types:native-event-adaptation]: event-bearing contracts use native DOM events instead of React synthetic events.
// OCTANE DIVERGENCE[react-select-octane-styles][types:octane-style-adaptation]: renderer-owned style contracts use Octane style objects instead of Emotion CSS objects.

import type * as Local from '../src/index';
import type * as LocalAsync from '../src/async.tsrx';
import type * as LocalAsyncCreatable from '../src/async-creatable.tsrx';
import type * as LocalBase from '../src/base';
import type * as LocalCreatable from '../src/creatable.tsrx';
import type * as React from 'react-select';
import type * as ReactAsync from 'react-select/async';
import type * as ReactAsyncCreatable from 'react-select/async-creatable';
import type * as ReactBase from 'react-select/base';
import type * as ReactCreatable from 'react-select/creatable';

type Equal<Left, Right> =
	(<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
		? (<Value>() => Value extends Right ? 1 : 2) extends <Value>() => Value extends Left ? 1 : 2
			? true
			: false
		: false;
type Expect<Value extends true> = Value;
type DivergentKeys<Left, Right> = {
	[Key in keyof Left & keyof Right]-?: Equal<Left[Key], Right[Key]> extends true ? never : Key;
}[keyof Left & keyof Right];
type SurfaceDiff<Left, Right> = readonly [
	Exclude<keyof Left, keyof Right>,
	Exclude<keyof Right, keyof Left>,
	DivergentKeys<Left, Right>,
];

type Option = { label: string; value: string };
type Group = { label: string; options: readonly Option[] };

// Every framework-neutral declaration re-exported from the root entry point is
// compared as a complete type. Additions or member drift fail this inventory.
type PureDeclarations = readonly [
	Expect<Equal<typeof Local.defaultTheme, typeof React.defaultTheme>>,
	Expect<Equal<typeof Local.createFilter, typeof React.createFilter>>,
	Expect<Equal<Local.GroupBase<Option>, React.GroupBase<Option>>>,
	Expect<Equal<Local.Options<Option>, React.Options<Option>>>,
	Expect<Equal<Local.OptionsOrGroups<Option, Group>, React.OptionsOrGroups<Option, Group>>>,
	Expect<Equal<Local.GetOptionLabel<Option>, React.GetOptionLabel<Option>>>,
	Expect<Equal<Local.GetOptionValue<Option>, React.GetOptionValue<Option>>>,
	Expect<Equal<Local.SingleValue<Option>, React.SingleValue<Option>>>,
	Expect<Equal<Local.MultiValue<Option>, React.MultiValue<Option>>>,
	Expect<Equal<Local.PropsValue<Option>, React.PropsValue<Option>>>,
	Expect<Equal<Local.OnChangeValue<Option, false>, React.OnChangeValue<Option, false>>>,
	Expect<Equal<Local.OnChangeValue<Option, true>, React.OnChangeValue<Option, true>>>,
	Expect<Equal<Local.SetValueAction, React.SetValueAction>>,
	Expect<Equal<Local.ActionMetaBase<Option>, React.ActionMetaBase<Option>>>,
	Expect<Equal<Local.SelectOptionActionMeta<Option>, React.SelectOptionActionMeta<Option>>>,
	Expect<Equal<Local.DeselectOptionActionMeta<Option>, React.DeselectOptionActionMeta<Option>>>,
	Expect<Equal<Local.RemoveValueActionMeta<Option>, React.RemoveValueActionMeta<Option>>>,
	Expect<Equal<Local.PopValueActionMeta<Option>, React.PopValueActionMeta<Option>>>,
	Expect<Equal<Local.ClearActionMeta<Option>, React.ClearActionMeta<Option>>>,
	Expect<Equal<Local.CreateOptionActionMeta<Option>, React.CreateOptionActionMeta<Option>>>,
	Expect<
		Equal<
			Local.InitialInputFocusedActionMeta<Option, false>,
			React.InitialInputFocusedActionMeta<Option, false>
		>
	>,
	Expect<Equal<Local.ActionMeta<Option>, React.ActionMeta<Option>>>,
	Expect<Equal<Local.InputAction, React.InputAction>>,
	Expect<Equal<Local.InputActionMeta, React.InputActionMeta>>,
	Expect<Equal<Local.MenuPlacement, React.MenuPlacement>>,
	Expect<Equal<Local.CoercedMenuPlacement, React.CoercedMenuPlacement>>,
	Expect<Equal<Local.MenuPosition, React.MenuPosition>>,
	Expect<Equal<Local.FocusDirection, React.FocusDirection>>,
	Expect<Equal<Local.ClassNamesState, React.ClassNamesState>>,
	Expect<Equal<Local.CX, React.CX>>,
	Expect<Equal<Local.Colors, React.Colors>>,
	Expect<Equal<Local.ThemeSpacing, React.ThemeSpacing>>,
	Expect<Equal<Local.Theme, React.Theme>>,
	Expect<Equal<Local.ThemeConfig, React.ThemeConfig>>,
	Expect<Equal<Local.FilterOptionOption<Option>, React.FilterOptionOption<Option>>>,
	Expect<Equal<Local.FormatOptionLabelContext, React.FormatOptionLabelContext>>,
	Expect<Equal<Local.FormatOptionLabelMeta<Option>, React.FormatOptionLabelMeta<Option>>>,
	Expect<Equal<Local.OptionContext, React.OptionContext>>,
	Expect<Equal<Local.GuidanceContext, React.GuidanceContext>>,
	Expect<Equal<Local.AriaGuidanceProps, React.AriaGuidanceProps>>,
	Expect<Equal<Local.AriaOnChangeProps<Option, false>, React.AriaOnChangeProps<Option, false>>>,
	Expect<Equal<Local.AriaOnFilterProps, React.AriaOnFilterProps>>,
	Expect<Equal<Local.AriaOnFocusProps<Option, Group>, React.AriaOnFocusProps<Option, Group>>>,
	Expect<Equal<Local.AriaGuidance, React.AriaGuidance>>,
	Expect<Equal<Local.AriaOnChange<Option, false>, React.AriaOnChange<Option, false>>>,
	Expect<Equal<Local.AriaOnFilter, React.AriaOnFilter>>,
	Expect<Equal<Local.AriaOnFocus<Option, Group>, React.AriaOnFocus<Option, Group>>>,
	Expect<
		Equal<
			Local.AriaLiveMessages<Option, false, Group>,
			React.AriaLiveMessages<Option, false, Group>
		>
	>,
	Expect<
		Equal<
			LocalAsync.AsyncAdditionalProps<Option, Group>,
			Pick<
				ReactAsync.AsyncProps<Option, false, Group>,
				'cacheOptions' | 'defaultOptions' | 'isLoading' | 'loadOptions'
			>
		>
	>,
];

// Renderer-owned declarations are intentionally excluded from the exact set
// until their complete member-level adaptation ledger is executable. Keeping
// this list explicit prevents this fixture from implying whole-surface parity.
export type AdaptedDeclarationInventory = readonly [
	Local.Props<Option, false, Group>,
	LocalBase.Props<Option, false, Group>,
	LocalAsync.AsyncProps<Option, false, Group>,
	LocalCreatable.CreatableProps<Option, false, Group>,
	LocalAsyncCreatable.AsyncCreatableProps<Option, false, Group>,
	Local.SelectInstance<Option, false, Group>,
	Local.CommonProps<Option, false, Group>,
	Local.CommonPropsAndClassName<Option, false, Group>,
	Local.GetStyles<Option, false, Group>,
	Local.CSSInterpolation,
	Local.CSSObjectWithLabel,
	Local.SelectComponentsConfig<Option, false, Group>,
	Local.ContainerProps<Option, false, Group>,
	Local.ControlProps<Option, false, Group>,
	Local.GroupHeadingProps<Option, false, Group>,
	Local.GroupProps<Option, false, Group>,
	Local.ClearIndicatorProps<Option, false, Group>,
	Local.DropdownIndicatorProps<Option, false, Group>,
	Local.IndicatorSeparatorProps<Option, false, Group>,
	Local.IndicatorsContainerProps<Option, false, Group>,
	Local.InputProps<Option, false, Group>,
	Local.LoadingIndicatorProps<Option, false, Group>,
	Local.MenuListProps<Option, false, Group>,
	Local.MenuProps<Option, false, Group>,
	Local.MultiValueGenericProps<Option, false, Group>,
	Local.MultiValueProps<Option, false, Group>,
	Local.MultiValueRemoveProps<Option, false, Group>,
	Local.NoticeProps<Option, false, Group>,
	Local.OptionProps<Option, false, Group>,
	Local.PlaceholderProps<Option, false, Group>,
	Local.SingleValueProps<Option, false, Group>,
	Local.ValueContainerProps<Option, false, Group>,
	Local.StylesConfig<Option, false, Group>,
	Local.ClassNamesConfig<Option, false, Group>,
];

type RenderAdaptedProps =
	| 'classNames'
	| 'components'
	| 'formatGroupLabel'
	| 'formatOptionLabel'
	| 'loadingMessage'
	| 'noOptionsMessage'
	| 'onBlur'
	| 'onFocus'
	| 'onKeyDown'
	| 'placeholder'
	| 'styles';

type BaseSurfaceParity = Expect<
	Equal<
		SurfaceDiff<LocalBase.Props<Option, false, Group>, ReactBase.Props<Option, false, Group>>,
		readonly ['ref', never, RenderAdaptedProps]
	>
>;
const baseDiff: Record<
	DivergentKeys<LocalBase.Props<Option, false, Group>, ReactBase.Props<Option, false, Group>>,
	true
> = {
	classNames: true,
	components: true,
	formatGroupLabel: true,
	formatOptionLabel: true,
	loadingMessage: true,
	noOptionsMessage: true,
	onBlur: true,
	onFocus: true,
	onKeyDown: true,
	placeholder: true,
	styles: true,
};
void baseDiff;
type InstanceMethodParity = Expect<
	Equal<
		DivergentKeys<
			Pick<
				Local.SelectInstance<Option, false, Group>,
				keyof Local.SelectInstance<Option, false, Group>
			>,
			Pick<
				React.SelectInstance<Option, false, Group>,
				keyof Local.SelectInstance<Option, false, Group>
			>
		>,
		'getClassNames' | 'getComponents' | 'getStyles'
	>
>;
type RootSurfaceParity = Expect<
	Equal<
		SurfaceDiff<Local.Props<Option, false, Group>, React.Props<Option, false, Group>>,
		readonly ['ref', never, RenderAdaptedProps]
	>
>;
type AsyncSurfaceParity = Expect<
	Equal<
		SurfaceDiff<
			LocalAsync.AsyncProps<Option, false, Group>,
			ReactAsync.AsyncProps<Option, false, Group>
		>,
		readonly ['ref', never, RenderAdaptedProps]
	>
>;
type CreatableSurfaceParity = Expect<
	Equal<
		SurfaceDiff<
			LocalCreatable.CreatableProps<Option, false, Group>,
			ReactCreatable.CreatableProps<Option, false, Group>
		>,
		readonly ['ref', never, RenderAdaptedProps | 'formatCreateLabel' | 'getNewOptionData']
	>
>;
type AsyncCreatableSurfaceParity = Expect<
	Equal<
		SurfaceDiff<
			LocalAsyncCreatable.AsyncCreatableProps<Option, false, Group>,
			ReactAsyncCreatable.AsyncCreatableProps<Option, false, Group>
		>,
		readonly ['ref', never, RenderAdaptedProps | 'formatCreateLabel' | 'getNewOptionData']
	>
>;

export type ExhaustiveExactTypeParity = readonly [
	PureDeclarations,
	BaseSurfaceParity,
	InstanceMethodParity,
	RootSurfaceParity,
	AsyncSurfaceParity,
	CreatableSurfaceParity,
	AsyncCreatableSurfaceParity,
];
