import { useRef } from 'octane';

import { Item } from '../../src/stately/collections/Item';
import { useListState } from '../../src/stately/list/useListState';
import { useNumberFieldState } from '../../src/stately/numberfield/useNumberFieldState';
import { useSliderState } from '../../src/stately/slider/useSliderState';
import { useSlider } from '../../src/slider/useSlider';
import { useSliderThumb } from '../../src/slider/useSliderThumb';
import { useNumberField } from '../../src/numberfield/useNumberField';
import { useButton } from '../../src/button/useButton';
import { useGridList } from '../../src/gridlist/useGridList';
import { useGridListItem } from '../../src/gridlist/useGridListItem';
import { useTagGroup } from '../../src/tag/useTagGroup';
import { useTag } from '../../src/tag/useTag';
import { useBreadcrumbs } from '../../src/breadcrumbs/useBreadcrumbs';
import { useBreadcrumbItem } from '../../src/breadcrumbs/useBreadcrumbItem';

// ---------------------------------------------------------------------------
// Slider: useSliderState → useSlider + useSliderThumb.
// ---------------------------------------------------------------------------

export function SliderHarness() {
	const state = useSliderState({
		defaultValue: 20,
		minValue: 0,
		maxValue: 100,
		step: 10,
		numberFormatter: new Intl.NumberFormat('en-US'),
	});
	const trackRef = useRef<any>(null);
	const { groupProps, trackProps, labelProps } = useSlider({ label: 'Volume' }, state, trackRef);
	const inputRef = useRef<any>(null);
	const { thumbProps, inputProps } = useSliderThumb(
		{ index: 0, trackRef, inputRef, 'aria-label': 'Volume thumb' },
		state,
	);
	return (
		<div {...groupProps}>
			<span {...labelProps}>Volume</span>
			<div {...trackProps} ref={trackRef} data-testid="track">
				<div {...thumbProps} data-testid="thumb">
					<input {...inputProps} ref={inputRef} data-testid="thumb-input" />
				</div>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// NumberField: useNumberFieldState → useNumberField.
// ---------------------------------------------------------------------------

export function NumberFieldHarness() {
	const state = useNumberFieldState({
		locale: 'en-US',
		defaultValue: 5,
		minValue: 0,
		maxValue: 10,
	});
	const inputRef = useRef<any>(null);
	const { groupProps, inputProps, incrementButtonProps, decrementButtonProps, labelProps } =
		useNumberField({ label: 'Amount' }, state, inputRef);
	// incrementButtonProps/decrementButtonProps are AriaButtonProps, meant to be fed to
	// useButton by the consumer (not spread onto the DOM directly).
	const incRef = useRef<any>(null);
	const decRef = useRef<any>(null);
	const { buttonProps: incProps } = useButton(incrementButtonProps, incRef);
	const { buttonProps: decProps } = useButton(decrementButtonProps, decRef);
	return (
		<div {...groupProps}>
			<span {...labelProps}>Amount</span>
			<button {...decProps} ref={decRef} data-testid="dec">
				{'-'}
			</button>
			<input {...inputProps} ref={inputRef} data-testid="nf-input" />
			<button {...incProps} ref={incRef} data-testid="inc">
				{'+'}
			</button>
		</div>
	);
}

// ---------------------------------------------------------------------------
// GridList: useListState → useGridList + useGridListItem.
// ---------------------------------------------------------------------------

const ROWS = [
	{ id: 'a', name: 'Alpha' },
	{ id: 'b', name: 'Bravo' },
	{ id: 'c', name: 'Charlie' },
];

function renderRow(item: { id: string; name: string }) {
	return <Item key={item.id}>{item.name}</Item>;
}

function GridRow(props: { item: any; state: any }) {
	const ref = useRef<any>(null);
	const { rowProps, gridCellProps } = useGridListItem({ node: props.item }, props.state, ref);
	return (
		<div
			{...rowProps}
			ref={ref}
			data-selected={props.state.selectionManager.isSelected(props.item.key) ? 'y' : 'n'}
		>
			<div {...gridCellProps}>{props.item.rendered}</div>
		</div>
	);
}

export function GridListHarness() {
	const state = useListState({
		items: ROWS,
		children: renderRow as any,
		selectionMode: 'multiple',
	});
	const ref = useRef<any>(null);
	const { gridProps } = useGridList({ 'aria-label': 'Rows' }, state, ref);
	return (
		<div {...gridProps} ref={ref}>
			{[...state.collection].map((item: any) => (
				<GridRow key={item.key} item={item} state={state} />
			))}
		</div>
	);
}

// ---------------------------------------------------------------------------
// TagGroup: useListState → useTagGroup + useTag.
// ---------------------------------------------------------------------------

const TAGS = [
	{ id: 't1', name: 'One' },
	{ id: 't2', name: 'Two' },
];

function renderTag(item: { id: string; name: string }) {
	return <Item key={item.id}>{item.name}</Item>;
}

function Tag(props: { item: any; state: any }) {
	const ref = useRef<any>(null);
	const { rowProps, gridCellProps } = useTag({ item: props.item }, props.state, ref);
	return (
		<div {...rowProps} ref={ref}>
			<div {...gridCellProps}>{props.item.rendered}</div>
		</div>
	);
}

export function TagGroupHarness() {
	const state = useListState({ items: TAGS, children: renderTag as any });
	const ref = useRef<any>(null);
	const { gridProps, labelProps } = useTagGroup({ label: 'Tags' }, state, ref);
	return (
		<div>
			<span {...labelProps}>Tags</span>
			<div {...gridProps} ref={ref}>
				{[...state.collection].map((item: any) => (
					<Tag key={item.key} item={item} state={state} />
				))}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Breadcrumbs: useBreadcrumbs + useBreadcrumbItem.
// ---------------------------------------------------------------------------

function Crumb(props: { children: any; isCurrent?: boolean }) {
	const ref = useRef<any>(null);
	const { itemProps } = useBreadcrumbItem({ elementType: 'span', isCurrent: props.isCurrent }, ref);
	return (
		<span {...itemProps} ref={ref}>
			{props.children}
		</span>
	);
}

export function BreadcrumbsHarness() {
	const ref = useRef<any>(null);
	const { navProps } = useBreadcrumbs({ 'aria-label': 'Trail' });
	return (
		<nav {...navProps} ref={ref}>
			<ol>
				<li>
					<Crumb>Home</Crumb>
				</li>
				<li>
					<Crumb isCurrent={true}>Current</Crumb>
				</li>
			</ol>
		</nav>
	);
}
