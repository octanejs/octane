import { useContext, useRef } from 'octane';

import {
	Autocomplete,
	AutocompleteStateContext,
	SelectableCollectionContext,
} from '../../src/components/Autocomplete';
import {
	DropIndicator,
	DropIndicatorContext,
	useDndPersistedKeys,
	useRenderDropIndicator,
} from '../../src/components/DragAndDrop';
import { Input } from '../../src/components/Input';
import { TextField } from '../../src/components/TextField';
import { Provider, useContextProps } from '../../src/components/utils';
import { Item } from '../../src/stately/collections/Item';
import { useListState } from '../../src/stately/list/useListState';
import { useListBox } from '../../src/listbox/useListBox';
import { useOption } from '../../src/listbox/useOption';

// ---------------------------------------------------------------------------
// RAC Autocomplete: the real <Autocomplete> + <TextField>/<Input> (wired through
// FieldInputContext) around a collection consumer that mirrors upstream RAC
// ListBoxInner's contract: useContextProps(props, ref,
// SelectableCollectionContext) merges the autocomplete's collectionProps +
// merged collection ref, the autocomplete's per-node filter narrows the
// collection (upstream RAC uses UNSTABLE_useFilteredListState over the engine's
// BaseCollection; the Phase-2 useListState applies the same
// (textValue, node) => boolean contract through its nodes-level filter option),
// and useListBox consumes the merged props (virtual focus, typeahead opt-out,
// autoFocus, id, aria-label). RAC ListBox itself lands later this phase; the
// Phase-2 hooks are its exact internals.
// ---------------------------------------------------------------------------

export const LANGS = [
	{ id: 'js', name: 'JavaScript' },
	{ id: 'ts', name: 'TypeScript' },
	{ id: 'py', name: 'Python' },
	{ id: 'rb', name: 'Ruby' },
];

// Module-scope render function: value-position <Item> descriptors are what the
// collection builder walks.
function renderLang(item: { id: string; name: string }) {
	return <Item key={item.id}>{item.name}</Item>;
}

// The Autocomplete-level filter (textValue, inputValue, node) => boolean.
function contains(textValue: string, inputValue: string): boolean {
	return textValue.toLowerCase().includes(inputValue.toLowerCase());
}

function Option(props: { item: any; state: any }) {
	const ref = useRef<any>(null);
	const { optionProps, isFocused, isSelected } = useOption(
		{ key: props.item.key },
		props.state,
		ref,
	);
	return (
		<li
			{...optionProps}
			ref={ref}
			data-focused={isFocused ? 'true' : undefined}
			data-selected-item={isSelected ? 'true' : undefined}
		>
			{props.item.rendered}
		</li>
	);
}

function AutocompleteListBox(propsIn: {
	items: Array<{ id: string; name: string }>;
	onSelectionChange?: (keys: any) => void;
}) {
	let listBoxRef = useRef<any>(null);
	let props: any = propsIn;
	// Upstream ListBoxInner: merge the autocomplete's collectionProps + collection
	// ref through SelectableCollectionContext.
	[props, listBoxRef] = useContextProps(props, listBoxRef, SelectableCollectionContext as any);
	let { filter } = props;
	let state = useListState({
		items: propsIn.items,
		children: renderLang as any,
		selectionMode: 'single',
		onSelectionChange: propsIn.onSelectionChange,
		filter: (nodes: any) =>
			filter ? [...nodes].filter((node: any) => filter(node.textValue, node)) : nodes,
	});
	let { listBoxProps } = useListBox(props, state, listBoxRef);
	return (
		<ul {...listBoxProps} ref={listBoxRef}>
			{[...state.collection].map((item: any) => (
				<Option key={item.key} item={item} state={state} />
			))}
		</ul>
	);
}

// Mirrors the AutocompleteStateContext the RAC Autocomplete provides so tests can
// observe inputValue/focusedNodeId without reaching into internals.
function StateProbe() {
	const state = useContext(AutocompleteStateContext)!;
	return (
		<output data-input-value={state.inputValue} data-focused-node={state.focusedNodeId ?? 'null'}>
			{'v:' + state.inputValue}
		</output>
	);
}

export function AutocompleteScenario(props: {
	onInputChange?: (value: string) => void;
	onSelectionChange?: (keys: any) => void;
}) {
	return (
		<Autocomplete filter={contains} onInputChange={props.onInputChange}>
			<TextField aria-label="Search languages" data-testid="ac-field">
				<Input />
			</TextField>
			<AutocompleteListBox items={LANGS} onSelectionChange={props.onSelectionChange} />
			<StateProbe />
		</Autocomplete>
	);
}

// ---------------------------------------------------------------------------
// DragAndDrop context layer: DropIndicator renders through DropIndicatorContext's
// render function (the collection components provide it; here a minimal render
// stands in), useRenderDropIndicator gates on hooks.useDropIndicator and renders
// the default <DropIndicator> when virtually dragging, and useDndPersistedKeys
// persists the focused key when no dnd is active.
// ---------------------------------------------------------------------------

function renderIndicator(props: any, ref: any) {
	return (
		<div ref={ref} data-testid="indicator" data-target-key={String(props.target.key)}>
			drop here
		</div>
	);
}

export function DropIndicatorScenario() {
	const ref = useRef<any>(null);
	return (
		<Provider values={[[DropIndicatorContext, { render: renderIndicator }]] as any}>
			<DropIndicator target={{ type: 'item', key: 'a', dropPosition: 'before' } as any} ref={ref} />
		</Provider>
	);
}

function RenderDropIndicatorProbe(props: { hooks: any }) {
	const fn = useRenderDropIndicator(props.hooks, undefined);
	return (
		<div data-testid="rdi" data-has-fn={fn ? 'true' : 'false'}>
			{fn ? fn({ type: 'item', key: 'b', dropPosition: 'before' } as any) : null}
		</div>
	);
}

export function RenderDropIndicatorScenario(props: { hooks: any }) {
	return (
		<Provider values={[[DropIndicatorContext, { render: renderIndicator }]] as any}>
			<RenderDropIndicatorProbe hooks={props.hooks} />
		</Provider>
	);
}

export function DndPersistedKeysScenario(props: { focusedKey: any }) {
	const keys = useDndPersistedKeys({ focusedKey: props.focusedKey } as any, undefined, undefined);
	return <div data-testid="persisted" data-keys={[...keys].join(',')} />;
}
