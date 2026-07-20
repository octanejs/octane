import * as React from 'react';
import { createPortal } from 'react-dom';
import * as Plot from '@observablehq/plot';
import * as d3 from 'd3';
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { Check, Code2, Copy, Download, List } from 'lucide-react';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@radix-ui/react-dropdown-menu';
import { twMerge } from 'tailwind-merge';
import { Tooltip } from '~/components/Tooltip';
import { observablePlotClassName } from '~/components/charts/PlotContainer';
import {
	binningOptionsByType,
	getHistoryStartDate,
	getUtcDay,
	getUtcToday,
	NPM_STATS_START_DATE,
} from './binning';
import { selectLatestBucketQueryData } from './npmQueryOptions';
import type {
	BarOrientation,
	BinType,
	ChartType,
	LatestBarSort,
	NpmQueryData,
	PackageGroup,
	ShowDataMode,
	TimeRange,
	TransformMode,
	ViewMode,
} from './shared';
import {
	formatNumber,
	getBaselineDisplayName,
	getPackageColor,
	getPackageGroupLabel,
	hasPackageGroupLabel,
	isPackageGroupHidden,
} from './shared';
import { BASELINE_LINE_COLOR } from './BaselineSection';

const BASELINE_LINE_SERIES = '__baseline__';
const percentFormatter = new Intl.NumberFormat('en-US', {
	style: 'percent',
	maximumFractionDigits: 1,
});
const compactAxisNumberFormatter = d3.format('.3~s');
const chartUpdateTransitionDurationMs = 500;
const chartUpdateEase = d3.easeExpOut;

function formatCompactAxisNumber(value: number) {
	if (!Number.isFinite(value) || value === 0) return '0';
	return compactAxisNumberFormatter(value);
}

type StackedDateRow<Datum> = {
	date: Date;
	pointsBySeries: Map<string, Datum>;
	[seriesName: string]: Date | Map<string, Datum> | number;
};

declare global {
	interface SVGSVGElement {
		updateBarPlot?: (options: BarPlotUpdateOptions) => void;
	}
}

type CategoricalAxis = 'x' | 'y';
type BarRectAttributes = {
	height: number | undefined;
	width: number | undefined;
	x: number | undefined;
	y: number | undefined;
};
type BarPlotUpdateOptions = {
	nextBarKeys: Array<string>;
	nextDomain: Array<string>;
	nextPlot: ReturnType<typeof Plot.plot>;
};
type KeyedBarRect = {
	key: string;
	rect: SVGRectElement;
};
type AxisTickPart = 'tick' | 'label' | 'grid';
type AxisTickPositionAttribute = 'transform' | 'x' | 'y' | 'x1' | 'x2' | 'y1' | 'y2';
type AxisTickElementAttributes = Record<AxisTickPositionAttribute, string | undefined> & {
	opacity: number | undefined;
};
type KeyedTickElement = {
	category: string;
	element: SVGElement;
	key: string;
	part: AxisTickPart;
};
type TimelineRangeValue = {
	end: number | undefined;
	start: number | undefined;
};
type TimelineRangeScrubberProps = {
	dates: Array<Date>;
	endIndex: number;
	marginLeft: number;
	marginRight: number;
	onRangeChange: (startIndex: number, endIndex: number) => void;
	startIndex: number;
};
type TimelineScrubberDragState = {
	anchorIndex: number;
	focusIndex: number;
};
type TimelineScrubberPanState = {
	anchorIndex: number;
	endIndex: number;
	startIndex: number;
};

const axisTickPositionAttributes: Array<AxisTickPositionAttribute> = [
	'transform',
	'x',
	'y',
	'x1',
	'x2',
	'y1',
	'y2',
];
const timelineScrubberDateFormatter = new Intl.DateTimeFormat('en-US', {
	day: 'numeric',
	month: 'short',
	year: 'numeric',
});
const timelineScrubberInputStyles =
	'pointer-events-none absolute inset-0 h-8 w-full appearance-none bg-transparent outline-none [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:cursor-ew-resize [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-gray-400 [&::-moz-range-thumb]:bg-gray-300 [&::-moz-range-thumb]:shadow-xs [&::-moz-range-track]:h-3 [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:h-3 [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:mt-0 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:cursor-ew-resize [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-gray-400 [&::-webkit-slider-thumb]:bg-gray-300 [&::-webkit-slider-thumb]:shadow-xs dark:[&::-moz-range-thumb]:border-gray-500 dark:[&::-moz-range-thumb]:bg-gray-700 dark:[&::-webkit-slider-thumb]:border-gray-500 dark:[&::-webkit-slider-thumb]:bg-gray-700';
const timelineScrubberStartInputStyles =
	'[&::-moz-range-thumb]:rounded-l-sm [&::-moz-range-thumb]:rounded-r-[1px] [&::-webkit-slider-thumb]:rounded-l-sm [&::-webkit-slider-thumb]:rounded-r-[1px]';
const timelineScrubberEndInputStyles =
	'[&::-moz-range-thumb]:rounded-l-[1px] [&::-moz-range-thumb]:rounded-r-sm [&::-webkit-slider-thumb]:rounded-l-[1px] [&::-webkit-slider-thumb]:rounded-r-sm';

function getNumberAttribute(element: Element | undefined, attribute: string) {
	const value = Number(element?.getAttribute(attribute));
	return Number.isFinite(value) ? value : undefined;
}

function clampTimelineIndex(index: number, maxIndex: number) {
	return Math.max(0, Math.min(index, maxIndex));
}

function getTimelineIndexForTime({
	dates,
	fallbackIndex,
	time,
}: {
	dates: Array<Date>;
	fallbackIndex: number;
	time: number | undefined;
}) {
	if (time === undefined || !Number.isFinite(time) || dates.length === 0) {
		return fallbackIndex;
	}

	let low = 0;
	let high = dates.length - 1;

	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		const middleTime = dates[middle]?.getTime();

		if (middleTime === undefined) break;
		if (middleTime === time) return middle;
		if (middleTime < time) {
			low = middle + 1;
		} else {
			high = middle - 1;
		}
	}

	const nextIndex = clampTimelineIndex(low, dates.length - 1);
	const previousIndex = clampTimelineIndex(low - 1, dates.length - 1);
	const nextTime = dates[nextIndex]?.getTime();
	const previousTime = dates[previousIndex]?.getTime();
	const nextDistance =
		nextTime === undefined ? Number.POSITIVE_INFINITY : Math.abs(nextTime - time);
	const previousDistance =
		previousTime === undefined ? Number.POSITIVE_INFINITY : Math.abs(previousTime - time);

	return previousDistance <= nextDistance ? previousIndex : nextIndex;
}

function formatTimelineScrubberDate(date: Date | undefined) {
	return date ? timelineScrubberDateFormatter.format(date) : '';
}

function getTimelineIndexFromPointer({
	clientX,
	element,
	maxIndex,
}: {
	clientX: number;
	element: HTMLElement;
	maxIndex: number;
}) {
	const box = element.getBoundingClientRect();
	const progress = box.width > 0 ? (clientX - box.left) / box.width : 0;

	return clampTimelineIndex(Math.round(progress * maxIndex), maxIndex);
}

function getChartUpdateTransition() {
	return d3.transition().duration(chartUpdateTransitionDurationMs).ease(chartUpdateEase);
}

function getBarRectAttributes(rect: SVGRectElement): BarRectAttributes {
	return {
		height: getNumberAttribute(rect, 'height'),
		width: getNumberAttribute(rect, 'width'),
		x: getNumberAttribute(rect, 'x'),
		y: getNumberAttribute(rect, 'y'),
	};
}

function getBarRects(svg: SVGSVGElement) {
	return [...svg.querySelectorAll<SVGRectElement>('g[aria-label="bar"] rect')];
}

function getBarGroup(svg: SVGSVGElement) {
	return svg.querySelector<SVGGElement>('g[aria-label="bar"]');
}

function getBarCapLayer(svg: SVGSVGElement) {
	return svg.querySelector<SVGElement>('g[aria-label="tick"]');
}

function getBarCapElements(svg: SVGSVGElement) {
	return [...svg.querySelectorAll<SVGElement>('g[aria-label="tick"]>*')];
}

function getKeyedBarRects({ barKeys, svg }: { barKeys: Array<string>; svg: SVGSVGElement }) {
	const keyedBars: Array<KeyedBarRect> = [];

	getBarRects(svg).forEach((bar, index) => {
		const key = barKeys[index];
		if (!key) return;

		bar.setAttribute('data-bar-key', key);
		keyedBars.push({ key, rect: bar });
	});

	return keyedBars;
}

function getKeyedBarCapElements({ barKeys, svg }: { barKeys: Array<string>; svg: SVGSVGElement }) {
	const keyedCaps: Array<KeyedTickElement> = [];

	getBarCapElements(svg).forEach((element, index) => {
		const key = barKeys[index];
		if (!key) return;

		element.setAttribute('data-bar-cap-key', key);
		keyedCaps.push({ category: key, element, key, part: 'tick' });
	});

	return keyedCaps;
}

function getLiveKeyedBarRects(svg: SVGSVGElement) {
	const keyedBars: Array<KeyedBarRect> = [];

	getBarRects(svg).forEach((bar) => {
		const key = bar.getAttribute('data-bar-key');
		if (!key) return;

		keyedBars.push({ key, rect: bar });
	});

	return keyedBars;
}

function getLiveKeyedBarCapElements(svg: SVGSVGElement) {
	const keyedCaps: Array<KeyedTickElement> = [];

	getBarCapElements(svg).forEach((element) => {
		const key = element.getAttribute('data-bar-cap-key');
		if (!key) return;

		keyedCaps.push({ category: key, element, key, part: 'tick' });
	});

	return keyedCaps;
}

function getBarRectAttributesByKey({
	barKeys,
	svg,
}: {
	barKeys: Array<string>;
	svg: SVGSVGElement;
}) {
	const attributesByKey = new Map<string, BarRectAttributes>();

	getKeyedBarRects({ barKeys, svg }).forEach(({ key, rect }) => {
		attributesByKey.set(key, getBarRectAttributes(rect));
	});

	return attributesByKey;
}

function getBarRectsByKey({ barKeys, svg }: { barKeys: Array<string>; svg: SVGSVGElement }) {
	const rectsByKey = new Map<string, SVGRectElement>();

	getKeyedBarRects({ barKeys, svg }).forEach(({ key, rect }) => {
		rectsByKey.set(key, rect);
	});

	return rectsByKey;
}

function getBarCapElementsByKey({ barKeys, svg }: { barKeys: Array<string>; svg: SVGSVGElement }) {
	const elementByKey = new Map<string, KeyedTickElement>();

	getKeyedBarCapElements({ barKeys, svg }).forEach((keyedCap) => {
		elementByKey.set(keyedCap.key, keyedCap);
	});

	return elementByKey;
}

function getUniqueKeyedBarRects(svg: SVGSVGElement) {
	const keyedBarsByKey = new Map<string, SVGRectElement>();

	getLiveKeyedBarRects(svg).forEach(({ key, rect }) => {
		if (!keyedBarsByKey.has(key)) {
			keyedBarsByKey.set(key, rect);
		}
	});

	return [...keyedBarsByKey].map(([key, rect]) => ({ key, rect }));
}

function getElementOpacity(element: Element) {
	const opacity = Number(element.getAttribute('opacity'));
	return Number.isFinite(opacity) ? opacity : undefined;
}

function getCollapsedBarRectAttributes({
	axis,
	attributes,
}: {
	axis: CategoricalAxis;
	attributes: BarRectAttributes;
}): BarRectAttributes {
	const x = attributes.x ?? 0;
	const y = attributes.y ?? 0;
	const width = attributes.width ?? 0;
	const height = attributes.height ?? 0;

	if (axis === 'x') {
		return {
			x,
			y: y + height,
			width,
			height: 0,
		};
	}

	return {
		x,
		y,
		width: 0,
		height,
	};
}

function setBarRectAttributes(rect: SVGRectElement, attributes: BarRectAttributes) {
	if (attributes.x !== undefined) rect.setAttribute('x', `${attributes.x}`);
	if (attributes.y !== undefined) rect.setAttribute('y', `${attributes.y}`);
	if (attributes.width !== undefined) {
		rect.setAttribute('width', `${attributes.width}`);
	}
	if (attributes.height !== undefined) {
		rect.setAttribute('height', `${attributes.height}`);
	}
}

function cloneBarRect(rect: SVGRectElement) {
	const clone = rect.cloneNode(true);
	return clone instanceof SVGRectElement ? clone : undefined;
}

function getCategoricalTickElements({
	axis,
	domain,
	svg,
}: {
	axis: CategoricalAxis;
	domain: Array<string>;
	svg: SVGSVGElement;
}) {
	const keyedTicks: Array<KeyedTickElement> = [];
	const tickParts: Array<{
		part: AxisTickPart;
		elements: Array<SVGElement>;
	}> = [
		{
			part: 'tick',
			elements: [...svg.querySelectorAll<SVGElement>(`[aria-label='${axis}-axis tick']>*`)],
		},
		{
			part: 'label',
			elements: [...svg.querySelectorAll<SVGElement>(`[aria-label='${axis}-axis tick label']>*`)],
		},
	];

	tickParts.forEach(({ elements, part }) => {
		elements.forEach((element, index) => {
			const category = element.textContent?.trim() || domain[index] || '';
			if (!category) return;

			const key = `${part}:${category}`;
			element.setAttribute('data-axis-tick-category', category);
			element.setAttribute('data-axis-tick-key', key);
			element.setAttribute('data-axis-tick-part', part);
			keyedTicks.push({ category, element, key, part });
		});
	});

	return keyedTicks;
}

function getLiveCategoricalTickElements({
	axis,
	svg,
}: {
	axis: CategoricalAxis;
	svg: SVGSVGElement;
}) {
	const keyedTicks: Array<KeyedTickElement> = [];
	const tickElements = [
		...svg.querySelectorAll<SVGElement>(`[aria-label='${axis}-axis tick']>*`),
		...svg.querySelectorAll<SVGElement>(`[aria-label='${axis}-axis tick label']>*`),
	];

	tickElements.forEach((element) => {
		const key = element.getAttribute('data-axis-tick-key');
		if (!key) return;

		const category = element.getAttribute('data-axis-tick-category') ?? key;
		const part = element.getAttribute('data-axis-tick-part') === 'label' ? 'label' : 'tick';
		keyedTicks.push({ category, element, key, part });
	});

	return keyedTicks;
}

function getCategoricalTickElementsByKey({
	axis,
	domain,
	svg,
}: {
	axis: CategoricalAxis;
	domain: Array<string>;
	svg: SVGSVGElement;
}) {
	const elementByKey = new Map<string, KeyedTickElement>();

	getCategoricalTickElements({ axis, domain, svg }).forEach((keyedTick) => {
		elementByKey.set(keyedTick.key, keyedTick);
	});

	return elementByKey;
}

function getTickElementTransform(element: SVGElement | undefined) {
	return element?.getAttribute('transform') || undefined;
}

function cloneTickElement(element: SVGElement) {
	const clone = element.cloneNode(true);
	return clone instanceof SVGElement ? clone : undefined;
}

function getAxisTickElementAttributes(element: SVGElement): AxisTickElementAttributes {
	const attributes: AxisTickElementAttributes = {
		opacity: getElementOpacity(element),
		transform: undefined,
		x: undefined,
		y: undefined,
		x1: undefined,
		x2: undefined,
		y1: undefined,
		y2: undefined,
	};

	axisTickPositionAttributes.forEach((attribute) => {
		attributes[attribute] = element.getAttribute(attribute) || undefined;
	});

	return attributes;
}

function setAxisTickElementAttributes(element: SVGElement, attributes: AxisTickElementAttributes) {
	axisTickPositionAttributes.forEach((attribute) => {
		const value = attributes[attribute];
		if (value === undefined) {
			element.removeAttribute(attribute);
			return;
		}

		element.setAttribute(attribute, value);
	});

	if (attributes.opacity === undefined) {
		element.removeAttribute('opacity');
		return;
	}

	element.setAttribute('opacity', `${attributes.opacity}`);
}

function transitionAxisTickElementsToTarget({
	targetAttributesByKey,
	ticks,
	transition,
}: {
	targetAttributesByKey: Map<string, AxisTickElementAttributes>;
	ticks: Array<KeyedTickElement>;
	transition: d3.Transition<d3.BaseType, unknown, null, undefined>;
}) {
	const tickTransition = d3
		.selectAll<SVGElement, string>(ticks.map(({ element }) => element))
		.data(ticks.map(({ key }) => key))
		.transition(transition)
		.attr('opacity', 1);

	axisTickPositionAttributes.forEach((attribute) => {
		tickTransition.attr(attribute, function (key) {
			const targetAttributes = targetAttributesByKey.get(key);
			if (!targetAttributes) return this.getAttribute(attribute);

			return targetAttributes[attribute] ?? null;
		});
	});
}

function getValueAxisTickElements({ axis, svg }: { axis: CategoricalAxis; svg: SVGSVGElement }) {
	const keyedTicks: Array<KeyedTickElement> = [];
	const labelValues = [
		...svg.querySelectorAll<SVGElement>(`[aria-label='${axis}-axis tick label']>*`),
	].map((element) => element.textContent?.trim() || '');
	const tickParts: Array<{
		part: AxisTickPart;
		elements: Array<SVGElement>;
	}> = [
		{
			part: 'grid',
			elements: [...svg.querySelectorAll<SVGElement>(`[aria-label='${axis}-grid']>*`)],
		},
		{
			part: 'tick',
			elements: [...svg.querySelectorAll<SVGElement>(`[aria-label='${axis}-axis tick']>*`)],
		},
		{
			part: 'label',
			elements: [...svg.querySelectorAll<SVGElement>(`[aria-label='${axis}-axis tick label']>*`)],
		},
	];

	tickParts.forEach(({ elements, part }) => {
		elements.forEach((element, index) => {
			const category = labelValues[index] || element.textContent?.trim() || '';
			if (!category) return;

			const key = `value:${part}:${category}`;
			element.setAttribute('data-value-axis-tick-category', category);
			element.setAttribute('data-value-axis-tick-key', key);
			element.setAttribute('data-value-axis-tick-part', part);
			keyedTicks.push({ category, element, key, part });
		});
	});

	return keyedTicks;
}

function getLiveValueAxisTickElements({
	axis,
	svg,
}: {
	axis: CategoricalAxis;
	svg: SVGSVGElement;
}) {
	const keyedTicks: Array<KeyedTickElement> = [];
	const tickElements = [
		...svg.querySelectorAll<SVGElement>(`[aria-label='${axis}-grid']>*`),
		...svg.querySelectorAll<SVGElement>(`[aria-label='${axis}-axis tick']>*`),
		...svg.querySelectorAll<SVGElement>(`[aria-label='${axis}-axis tick label']>*`),
	];

	tickElements.forEach((element) => {
		const key = element.getAttribute('data-value-axis-tick-key');
		if (!key) return;

		const category = element.getAttribute('data-value-axis-tick-category') ?? key;
		const partAttribute = element.getAttribute('data-value-axis-tick-part');
		const part = partAttribute === 'grid' ? 'grid' : partAttribute === 'label' ? 'label' : 'tick';
		keyedTicks.push({ category, element, key, part });
	});

	return keyedTicks;
}

function getValueAxisTickElementsByKey({
	axis,
	svg,
}: {
	axis: CategoricalAxis;
	svg: SVGSVGElement;
}) {
	const elementByKey = new Map<string, KeyedTickElement>();

	getValueAxisTickElements({ axis, svg }).forEach((keyedTick) => {
		if (!elementByKey.has(keyedTick.key)) {
			elementByKey.set(keyedTick.key, keyedTick);
		}
	});

	return elementByKey;
}

function getCategoricalTickLayerByPart({
	axis,
	svg,
}: {
	axis: CategoricalAxis;
	svg: SVGSVGElement;
}) {
	const layerByPart = new Map<AxisTickPart, SVGElement>();
	const gridLayer = svg.querySelector<SVGElement>(`[aria-label='${axis}-grid']`);
	const tickLayer = svg.querySelector<SVGElement>(`[aria-label='${axis}-axis tick']`);
	const tickLabelLayer = svg.querySelector<SVGElement>(`[aria-label='${axis}-axis tick label']`);

	if (gridLayer) layerByPart.set('grid', gridLayer);
	if (tickLayer) layerByPart.set('tick', tickLayer);
	if (tickLabelLayer) layerByPart.set('label', tickLabelLayer);

	return layerByPart;
}

function attachCategoricalDomainUpdater({
	axis,
	barKeys,
	domain,
	svg,
}: {
	axis: CategoricalAxis;
	barKeys: Array<string>;
	domain: Array<string>;
	svg: SVGSVGElement;
}) {
	const valueAxis: CategoricalAxis = axis === 'x' ? 'y' : 'x';

	getKeyedBarRects({ barKeys, svg });
	getKeyedBarCapElements({ barKeys, svg });
	getCategoricalTickElements({ axis, domain, svg });
	getValueAxisTickElements({ axis: valueAxis, svg });

	svg.updateBarPlot = ({ nextBarKeys, nextDomain, nextPlot }) => {
		const nextSvg = getPlotSvg(nextPlot);
		if (!nextSvg) return;

		const currentKeyedBars = getUniqueKeyedBarRects(svg);
		const currentBarAttributesByKey = new Map<string, BarRectAttributes>();
		const currentBarsByKey = new Map<string, SVGRectElement>();

		currentKeyedBars.forEach(({ key, rect }) => {
			currentBarAttributesByKey.set(key, getBarRectAttributes(rect));
			currentBarsByKey.set(key, rect);
		});

		const targetBarAttributesByKey = getBarRectAttributesByKey({
			barKeys: nextBarKeys,
			svg: nextSvg,
		});
		const targetBarsByKey = getBarRectsByKey({
			barKeys: nextBarKeys,
			svg: nextSvg,
		});
		const nextBarGroup = getBarGroup(nextSvg);
		const currentBarCaps = getLiveKeyedBarCapElements(svg);
		const currentBarCapElementsByKey = new Map<string, KeyedTickElement>();

		currentBarCaps.forEach((cap) => {
			if (!currentBarCapElementsByKey.has(cap.key)) {
				currentBarCapElementsByKey.set(cap.key, cap);
			}
		});

		const targetBarCapElementsByKey = getBarCapElementsByKey({
			barKeys: nextBarKeys,
			svg: nextSvg,
		});
		const targetBarCapAttributesByKey = new Map<string, AxisTickElementAttributes>();

		targetBarCapElementsByKey.forEach(({ element }, key) => {
			targetBarCapAttributesByKey.set(key, getAxisTickElementAttributes(element));
		});

		const nextBarCapLayer = getBarCapLayer(nextSvg);
		const currentKeyedTicks = getLiveCategoricalTickElements({ axis, svg });
		const currentTickElementsByKey = new Map<string, KeyedTickElement>();

		currentKeyedTicks.forEach((tick) => {
			if (!currentTickElementsByKey.has(tick.key)) {
				currentTickElementsByKey.set(tick.key, tick);
			}
		});

		const targetTickElementsByKey = getCategoricalTickElementsByKey({
			axis,
			domain: nextDomain,
			svg: nextSvg,
		});
		const targetTickTransformByKey = new Map<string, string>();

		targetTickElementsByKey.forEach(({ element }, key) => {
			const transform = getTickElementTransform(element);
			if (transform) {
				targetTickTransformByKey.set(key, transform);
			}
		});

		const targetTickLayersByPart = getCategoricalTickLayerByPart({
			axis,
			svg: nextSvg,
		});
		const currentValueTicks = getLiveValueAxisTickElements({
			axis: valueAxis,
			svg,
		});
		const currentValueTickElementsByKey = new Map<string, KeyedTickElement>();

		currentValueTicks.forEach((tick) => {
			if (!currentValueTickElementsByKey.has(tick.key)) {
				currentValueTickElementsByKey.set(tick.key, tick);
			}
		});

		const targetValueTickElementsByKey = getValueAxisTickElementsByKey({
			axis: valueAxis,
			svg: nextSvg,
		});
		const targetValueTickAttributesByKey = new Map<string, AxisTickElementAttributes>();

		targetValueTickElementsByKey.forEach(({ element }, key) => {
			targetValueTickAttributesByKey.set(key, getAxisTickElementAttributes(element));
		});

		const targetValueTickLayersByPart = getCategoricalTickLayerByPart({
			axis: valueAxis,
			svg: nextSvg,
		});
		const transition = getChartUpdateTransition();
		const retainedBars: Array<KeyedBarRect> = [];
		const enteringBars: Array<KeyedBarRect> = [];

		nextBarKeys.forEach((key) => {
			const targetBar = targetBarsByKey.get(key);
			const targetAttributes = targetBarAttributesByKey.get(key);
			if (!targetBar || !targetAttributes) return;

			const currentAttributes = currentBarAttributesByKey.get(key);
			if (currentAttributes) {
				setBarRectAttributes(targetBar, currentAttributes);
				const currentBar = currentBarsByKey.get(key);
				const currentOpacity = currentBar ? getElementOpacity(currentBar) : undefined;
				if (currentOpacity !== undefined) {
					targetBar.setAttribute('opacity', `${currentOpacity}`);
				}
				retainedBars.push({ key, rect: targetBar });
				return;
			}

			setBarRectAttributes(
				targetBar,
				getCollapsedBarRectAttributes({
					axis,
					attributes: targetAttributes,
				}),
			);
			targetBar.setAttribute('opacity', '0');
			enteringBars.push({ key, rect: targetBar });
		});

		if (nextBarGroup) {
			currentKeyedBars.forEach(({ key, rect }) => {
				if (targetBarAttributesByKey.has(key)) return;

				const exitingBar = cloneBarRect(rect);
				if (!exitingBar) return;

				const currentAttributes = getBarRectAttributes(rect);
				setBarRectAttributes(exitingBar, currentAttributes);
				const currentOpacity = getElementOpacity(rect);
				if (currentOpacity !== undefined) {
					exitingBar.setAttribute('opacity', `${currentOpacity}`);
				}
				exitingBar.setAttribute('data-bar-key', key);
				nextBarGroup.append(exitingBar);
				d3.select<SVGRectElement, BarRectAttributes>(exitingBar)
					.datum(
						getCollapsedBarRectAttributes({
							axis,
							attributes: currentAttributes,
						}),
					)
					.transition(transition)
					.attr('opacity', 0)
					.attr('x', (attributes) => attributes.x ?? 0)
					.attr('y', (attributes) => attributes.y ?? 0)
					.attr('width', (attributes) => attributes.width ?? 0)
					.attr('height', (attributes) => attributes.height ?? 0)
					.remove();
			});
		}

		const retainedTicks: Array<KeyedTickElement> = [];
		const enteringTicks: Array<KeyedTickElement> = [];
		const retainedBarCaps: Array<KeyedTickElement> = [];
		const enteringBarCaps: Array<KeyedTickElement> = [];

		targetBarCapElementsByKey.forEach((targetCap, key) => {
			const currentCap = currentBarCapElementsByKey.get(key);

			if (currentCap) {
				setAxisTickElementAttributes(
					targetCap.element,
					getAxisTickElementAttributes(currentCap.element),
				);
				retainedBarCaps.push(targetCap);
				return;
			}

			targetCap.element.setAttribute('opacity', '0');
			enteringBarCaps.push(targetCap);
		});

		currentBarCaps.forEach((currentCap) => {
			if (targetBarCapElementsByKey.has(currentCap.key) || !nextBarCapLayer) {
				return;
			}

			const exitingCap = cloneTickElement(currentCap.element);
			if (!exitingCap) return;

			setAxisTickElementAttributes(exitingCap, getAxisTickElementAttributes(currentCap.element));
			exitingCap.setAttribute('data-bar-cap-key', currentCap.key);
			nextBarCapLayer.append(exitingCap);
			d3.select(exitingCap).transition(transition).attr('opacity', 0).remove();
		});

		targetTickElementsByKey.forEach((targetTick, key) => {
			const currentTick = currentTickElementsByKey.get(key);
			const targetTransform = targetTickTransformByKey.get(key);

			if (currentTick) {
				const currentTransform = getTickElementTransform(currentTick.element);
				if (currentTransform) {
					targetTick.element.setAttribute('transform', currentTransform);
				}
				const currentOpacity = getElementOpacity(currentTick.element);
				if (currentOpacity !== undefined) {
					targetTick.element.setAttribute('opacity', `${currentOpacity}`);
				}
				retainedTicks.push(targetTick);
				return;
			}

			if (targetTransform) {
				targetTick.element.setAttribute('transform', targetTransform);
			}
			targetTick.element.setAttribute('opacity', '0');
			enteringTicks.push(targetTick);
		});

		currentKeyedTicks.forEach((currentTick) => {
			if (targetTickElementsByKey.has(currentTick.key)) return;

			const targetLayer = targetTickLayersByPart.get(currentTick.part);
			if (!targetLayer) return;

			const exitingTick = cloneTickElement(currentTick.element);
			if (!exitingTick) return;

			const currentTransform = getTickElementTransform(currentTick.element);
			if (currentTransform) {
				exitingTick.setAttribute('transform', currentTransform);
			}
			const currentOpacity = getElementOpacity(currentTick.element);
			if (currentOpacity !== undefined) {
				exitingTick.setAttribute('opacity', `${currentOpacity}`);
			}
			exitingTick.setAttribute('data-axis-tick-category', currentTick.category);
			exitingTick.setAttribute('data-axis-tick-key', currentTick.key);
			exitingTick.setAttribute('data-axis-tick-part', currentTick.part);
			targetLayer.append(exitingTick);
			d3.select(exitingTick).transition(transition).attr('opacity', 0).remove();
		});

		const retainedValueTicks: Array<KeyedTickElement> = [];
		const enteringValueTicks: Array<KeyedTickElement> = [];

		targetValueTickElementsByKey.forEach((targetTick, key) => {
			const currentTick = currentValueTickElementsByKey.get(key);

			if (currentTick) {
				setAxisTickElementAttributes(
					targetTick.element,
					getAxisTickElementAttributes(currentTick.element),
				);
				retainedValueTicks.push(targetTick);
				return;
			}

			targetTick.element.setAttribute('opacity', '0');
			enteringValueTicks.push(targetTick);
		});

		currentValueTicks.forEach((currentTick) => {
			if (targetValueTickElementsByKey.has(currentTick.key)) return;

			const targetLayer = targetValueTickLayersByPart.get(currentTick.part);
			if (!targetLayer) return;

			const exitingTick = cloneTickElement(currentTick.element);
			if (!exitingTick) return;

			setAxisTickElementAttributes(exitingTick, getAxisTickElementAttributes(currentTick.element));
			exitingTick.setAttribute('data-value-axis-tick-category', currentTick.category);
			exitingTick.setAttribute('data-value-axis-tick-key', currentTick.key);
			exitingTick.setAttribute('data-value-axis-tick-part', currentTick.part);
			targetLayer.append(exitingTick);
			d3.select(exitingTick).transition(transition).attr('opacity', 0).remove();
		});

		d3.selectAll<SVGRectElement, string>(retainedBars.map(({ rect }) => rect))
			.data(retainedBars.map(({ key }) => key))
			.transition(transition)
			.attr('opacity', 1)
			.attr('x', function (key) {
				return targetBarAttributesByKey.get(key)?.x ?? getNumberAttribute(this, 'x') ?? 0;
			})
			.attr('y', function (key) {
				return targetBarAttributesByKey.get(key)?.y ?? getNumberAttribute(this, 'y') ?? 0;
			})
			.attr('width', function (key) {
				return targetBarAttributesByKey.get(key)?.width ?? getNumberAttribute(this, 'width') ?? 0;
			})
			.attr('height', function (key) {
				return targetBarAttributesByKey.get(key)?.height ?? getNumberAttribute(this, 'height') ?? 0;
			});

		d3.selectAll<SVGRectElement, string>(enteringBars.map(({ rect }) => rect))
			.data(enteringBars.map(({ key }) => key))
			.transition(transition)
			.attr('opacity', 1)
			.attr('x', function (key) {
				return targetBarAttributesByKey.get(key)?.x ?? getNumberAttribute(this, 'x') ?? 0;
			})
			.attr('y', function (key) {
				return targetBarAttributesByKey.get(key)?.y ?? getNumberAttribute(this, 'y') ?? 0;
			})
			.attr('width', function (key) {
				return targetBarAttributesByKey.get(key)?.width ?? getNumberAttribute(this, 'width') ?? 0;
			})
			.attr('height', function (key) {
				return targetBarAttributesByKey.get(key)?.height ?? getNumberAttribute(this, 'height') ?? 0;
			});

		d3.selectAll<SVGElement, string>(retainedTicks.map(({ element }) => element))
			.data(retainedTicks.map(({ key }) => key))
			.transition(transition)
			.attr('opacity', 1)
			.attr('transform', function (key) {
				return targetTickTransformByKey.get(key) ?? this.getAttribute('transform');
			});

		d3.selectAll<SVGElement, string>(enteringTicks.map(({ element }) => element))
			.data(enteringTicks.map(({ key }) => key))
			.transition(transition)
			.attr('opacity', 1)
			.attr('transform', function (key) {
				return targetTickTransformByKey.get(key) ?? this.getAttribute('transform');
			});

		transitionAxisTickElementsToTarget({
			targetAttributesByKey: targetValueTickAttributesByKey,
			ticks: retainedValueTicks,
			transition,
		});

		transitionAxisTickElementsToTarget({
			targetAttributesByKey: targetValueTickAttributesByKey,
			ticks: enteringValueTicks,
			transition,
		});

		transitionAxisTickElementsToTarget({
			targetAttributesByKey: targetBarCapAttributesByKey,
			ticks: retainedBarCaps,
			transition,
		});

		transitionAxisTickElementsToTarget({
			targetAttributesByKey: targetBarCapAttributesByKey,
			ticks: enteringBarCaps,
			transition,
		});
	};
}

function getInsideOutOrderByLatestValue({
	latestValues,
	sums,
}: {
	latestValues: Array<number>;
	sums: Array<number>;
}) {
	const order = d3
		.range(latestValues.length)
		.sort(
			(a, b) => d3.descending(latestValues[a] ?? 0, latestValues[b] ?? 0) || d3.ascending(a, b),
		);
	const tops: Array<number> = [];
	const bottoms: Array<number> = [];
	let topSum = 0;
	let bottomSum = 0;

	order.forEach((index) => {
		const sum = sums[index] ?? 0;

		if (topSum < bottomSum) {
			topSum += sum;
			tops.push(index);
			return;
		}

		bottomSum += sum;
		bottoms.push(index);
	});

	return bottoms.reverse().concat(tops);
}

function getSubPackageColorForPackages({
	groupName,
	packageIndex,
	packages,
}: {
	groupName: string;
	packageIndex: number;
	packages: Array<PackageGroup>;
}) {
	const groupColor = getPackageColor(groupName, packages);
	const color = d3.color(groupColor);
	if (!color || packageIndex === 0) return groupColor;

	return packageIndex % 2 === 0
		? color.darker(packageIndex * 0.25).toString()
		: color.brighter(packageIndex * 0.35).toString();
}

// Plot figure component
type PlotOptions = NonNullable<Parameters<typeof Plot.plot>[0]>;
type ChartExportFormat = 'svg' | 'png' | 'jpeg' | 'gif' | 'webm';
type ColorLegendEntry = {
	label: string;
	color: string;
};
type ExportLegendItem = {
	color: string;
	label: string;
};
type ExportLegendLayoutItem = {
	item: ExportLegendItem;
	width: number;
};
type ExportLegendLayoutRow = {
	items: Array<ExportLegendLayoutItem>;
	width: number;
};
type ChartFillGradient = {
	bottomOpacity: number;
	color: string;
	id: string;
	topOpacity: number;
};
type ExportBackgroundMode = 'opaque' | 'transparent';
type ExportStyle = {
	backgroundColor: string;
	backgroundMode: ExportBackgroundMode;
	color: string;
};
type SerializedExportSvg = {
	height: number;
	source: string;
	width: number;
};
type SerializedAnimationFrame = SerializedExportSvg & {
	delayMs: number;
};
type LatestBucketOffsetBounds = {
	maxOffset: number;
	minOffset: number;
};
export type NpmStatsChartEmbedOptions = {
	includeTimelineRange: boolean;
	lockWidth: boolean;
	showLegend: boolean;
};
export type NpmStatsChartEmbedConfig = {
	buildUrl: (options: NpmStatsChartEmbedOptions) => string;
	hasTimelineRange: boolean;
	hasWidth: boolean;
};

const chartExportOptions = [
	{ value: 'svg', label: 'SVG' },
	{ value: 'png', label: 'PNG' },
	{ value: 'jpeg', label: 'JPEG' },
	{ value: 'gif', label: 'GIF' },
	{ value: 'webm', label: 'WebM' },
] as const satisfies ReadonlyArray<{
	value: ChartExportFormat;
	label: string;
}>;
const animatedExportMaxFrames = 240;
const animatedExportMinDelayMs = 35;
const animatedExportMaxDelayMs = 100;
const axisTickAverageCharacterWidth = 6.4;
const axisTickLineHeight = 12;
const chartActionButtonStyles =
	'flex size-6 items-center justify-center rounded bg-gray-500/10 text-gray-600 hover:bg-gray-500/20 hover:text-blue-500 dark:text-gray-400 dark:hover:text-gray-100';
const chartActionDropdownContentStyles =
	'z-50 min-w-[120px] rounded-md bg-white p-1.5 shadow-lg dark:bg-gray-800';
const chartActionDropdownItemStyles =
	'flex w-full cursor-pointer items-center rounded px-1.5 py-1 text-left text-xs outline-none hover:bg-gray-500/20 data-highlighted:bg-gray-500/20 data-highlighted:text-blue-500';
const chartEmbedInputStyles =
	'w-full rounded border border-gray-500/20 bg-gray-50 px-2 py-1.5 font-mono text-[11px] leading-snug outline-none focus:border-blue-500 dark:bg-gray-900';
const svgNamespace = 'http://www.w3.org/2000/svg';

function clampNumber(value: number, min: number, max: number) {
	return Math.max(min, Math.min(value, max));
}

function getEstimatedAxisLabelWidth(label: string) {
	return Math.ceil(label.length * axisTickAverageCharacterWidth);
}

function getCategoricalAxisLeftMargin({ labels, width }: { labels: Array<string>; width: number }) {
	const longestLabelWidth = d3.max(labels, (label) => getEstimatedAxisLabelWidth(label)) ?? 0;
	const maxMargin = clampNumber(Math.round(width * 0.38), 110, 280);

	return clampNumber(longestLabelWidth + 26, 90, maxMargin);
}

function getVerticalCategoricalXAxisLayout({
	height,
	labels,
	marginLeft,
	marginRight,
	width,
}: {
	height: number;
	labels: Array<string>;
	marginLeft: number;
	marginRight: number;
	width: number;
}) {
	const availableWidth = Math.max(0, width - marginLeft - marginRight);
	const tickSlotWidth = labels.length ? availableWidth / labels.length : 0;
	const longestLabelWidth = d3.max(labels, (label) => getEstimatedAxisLabelWidth(label)) ?? 0;
	const shouldRotateTicks =
		labels.length > 0 && longestLabelWidth > Math.max(36, tickSlotWidth - 8);

	if (!shouldRotateTicks) {
		return {
			labelOffset: 35,
			marginBottom: 64,
			tickRotate: undefined,
		};
	}

	const tickAngle = Math.PI / 6;
	const rotatedTickHeight = Math.ceil(
		longestLabelWidth * Math.sin(tickAngle) + axisTickLineHeight * Math.cos(tickAngle),
	);
	const maxMarginBottom = clampNumber(Math.round(height * 0.45), 88, 160);

	return {
		labelOffset: 55,
		marginBottom: clampNumber(44 + rotatedTickHeight, 76, maxMarginBottom),
		tickRotate: -30,
	};
}

function getPlotContentHeight({
	reservedHeight,
	totalHeight,
}: {
	reservedHeight: number;
	totalHeight: number | undefined;
}) {
	return Math.max(1, Math.floor((totalHeight ?? 0) - reservedHeight));
}

function getExportFileName(format: ChartExportFormat) {
	if (format === 'jpeg') return 'npm-stats-chart.jpg';
	return `npm-stats-chart.${format}`;
}

function isAnimatedExportFormat(format: ChartExportFormat): format is 'gif' | 'webm' {
	return format === 'gif' || format === 'webm';
}

function getStableIdPart(value: string) {
	let hash = 2166136261;

	for (let index = 0; index < value.length; index++) {
		hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
	}

	return (hash >>> 0).toString(36);
}

function getChartFillGradients({
	bottomOpacity = 0.1,
	entries,
	idPrefix,
	topOpacity = 0.8,
}: {
	bottomOpacity?: number;
	entries: Array<ColorLegendEntry>;
	idPrefix: string;
	topOpacity?: number;
}) {
	const seenColors = new Set<string>();
	const gradients: Array<ChartFillGradient> = [];

	entries.forEach((entry) => {
		if (seenColors.has(entry.color)) return;

		seenColors.add(entry.color);
		gradients.push({
			bottomOpacity,
			color: entry.color,
			id: `${idPrefix}-${getStableIdPart(entry.color)}`,
			topOpacity,
		});
	});

	return gradients;
}

function getChartFillGradientUrl({
	color,
	gradients,
}: {
	color: string;
	gradients: Array<ChartFillGradient>;
}) {
	const gradient = gradients.find((entry) => entry.color === color);

	return gradient ? `url(#${gradient.id})` : color;
}

function applyChartFillGradients({
	gradients,
	svg,
}: {
	gradients: Array<ChartFillGradient>;
	svg: SVGSVGElement;
}) {
	if (!gradients.length) return;

	const ownerDocument = svg.ownerDocument;
	const defs = svg.querySelector('defs') ?? ownerDocument.createElementNS(svgNamespace, 'defs');

	if (!defs.parentNode) {
		svg.prepend(defs);
	}

	gradients.forEach((entry) => {
		let gradient = defs.querySelector<SVGLinearGradientElement>(`#${entry.id}`);

		if (!gradient) {
			gradient = ownerDocument.createElementNS(svgNamespace, 'linearGradient');
			gradient.setAttribute('id', entry.id);
			defs.append(gradient);
		} else {
			gradient.replaceChildren();
		}

		gradient.setAttribute('x1', '0');
		gradient.setAttribute('x2', '0');
		gradient.setAttribute('y1', '1');
		gradient.setAttribute('y2', '0');

		const bottomStop = ownerDocument.createElementNS(svgNamespace, 'stop');
		bottomStop.setAttribute('offset', '0%');
		bottomStop.setAttribute('stop-color', entry.color);
		bottomStop.setAttribute('stop-opacity', `${entry.bottomOpacity}`);
		gradient.append(bottomStop);

		const topStop = ownerDocument.createElementNS(svgNamespace, 'stop');
		topStop.setAttribute('offset', '100%');
		topStop.setAttribute('stop-color', entry.color);
		topStop.setAttribute('stop-opacity', `${entry.topOpacity}`);
		gradient.append(topStop);
	});
}

function getUniqueColorLegendEntries(entries: Array<ColorLegendEntry>) {
	const colorByLabel = new Map<string, string>();

	entries.forEach((entry) => {
		if (!colorByLabel.has(entry.label)) {
			colorByLabel.set(entry.label, entry.color);
		}
	});

	return [...colorByLabel].map(([label, color]) => ({ label, color }));
}

function getPlotSvg(plot: ReturnType<typeof Plot.plot> | null) {
	if (!plot) return undefined;
	if (plot instanceof SVGSVGElement) return plot;
	return plot.querySelector('svg') ?? undefined;
}

function getLatestExportPackageData({
	binType,
	packages,
	queryData,
}: {
	binType: BinType;
	packages: Array<PackageGroup>;
	queryData: NpmQueryData;
}) {
	const binUnit = binningOptionsByType[binType].bin;
	const earliestQueryStart = queryData
		.map((pkg) => getUtcDay(new Date(pkg.start)))
		.sort((a, b) => a.getTime() - b.getTime())[0];
	const startDate = binUnit.floor(earliestQueryStart || NPM_STATS_START_DATE);

	const combinedPackageGroups = queryData.map((queryPackageGroup, index) => {
		const packageGroupWithHidden = packages[index];
		const shouldAlwaysIncludeFirstPackage =
			!packageGroupWithHidden ||
			!hasPackageGroupLabel(packageGroupWithHidden) ||
			!!packageGroupWithHidden.baseline;
		const visiblePackages = queryPackageGroup.packages.filter((p, i) => {
			const hiddenState = packageGroupWithHidden?.packages.find((pg) => pg.name === p.name)?.hidden;
			return (i === 0 && shouldAlwaysIncludeFirstPackage) || !hiddenState;
		});
		const groupName = packageGroupWithHidden
			? getPackageGroupLabel(packageGroupWithHidden)
			: queryPackageGroup.packages[0]?.name || 'Unknown';
		const downloadsByDate = new Map<number, number>();

		visiblePackages.forEach((pkg) => {
			pkg.downloads.forEach((d) => {
				const date = getUtcDay(new Date(d.day));
				if (date < startDate) return;

				downloadsByDate.set(
					date.getTime(),
					(downloadsByDate.get(date.getTime()) || 0) + d.downloads,
				);
			});
		});

		const packageDownloads = visiblePackages.map((pkg) => {
			const packageName = pkg.name || groupName;
			const packageDownloadsByDate = new Map<number, number>();

			pkg.downloads.forEach((d) => {
				const date = getUtcDay(new Date(d.day));
				if (date < startDate) return;

				packageDownloadsByDate.set(
					date.getTime(),
					(packageDownloadsByDate.get(date.getTime()) || 0) + d.downloads,
				);
			});

			return {
				packageName,
				downloads: Array.from(packageDownloadsByDate.entries()).map(([date, downloads]) => ({
					date: getUtcDay(new Date(date)),
					downloads,
				})),
			};
		});

		return {
			groupName,
			packageDownloads,
			downloads: Array.from(downloadsByDate.entries()).map(([date, downloads]) => [
				getUtcDay(new Date(date)),
				downloads,
			]) as Array<[Date, number]>,
		};
	});

	return combinedPackageGroups
		.map((packageGroup) => {
			const binned = d3.sort(
				d3.rollup(
					packageGroup.downloads,
					(v) => d3.sum(v, (d) => d[1]),
					(d) => binUnit.floor(d[0]),
				),
				(d) => d[0],
			);

			return {
				...packageGroup,
				downloads: binned.map((d) => ({
					name: packageGroup.groupName,
					date: getUtcDay(new Date(d[0])),
					downloads: d[1],
				})),
				packageDownloads: packageGroup.packageDownloads.map((pkg) => {
					const packageBinned = d3.sort(
						d3.rollup(
							pkg.downloads,
							(v) => d3.sum(v, (d) => d.downloads),
							(d) => binUnit.floor(d.date),
						),
						(d) => d[0],
					);

					return {
						...pkg,
						groupName: packageGroup.groupName,
						downloads: packageBinned.map((d) => ({
							groupName: packageGroup.groupName,
							packageName: pkg.packageName,
							date: getUtcDay(new Date(d[0])),
							downloads: d[1],
						})),
					};
				}),
			};
		})
		.filter((_, index) => {
			const packageGroupWithHidden = packages[index];
			return packageGroupWithHidden ? !isPackageGroupHidden(packageGroupWithHidden) : true;
		});
}

function createLatestBarExportPlot({
	barOrientation,
	barSort,
	binType,
	chartType,
	gradientIdPrefix,
	height,
	packages,
	queryData,
	width,
}: {
	barOrientation: BarOrientation;
	barSort: LatestBarSort;
	binType: BinType;
	chartType: ChartType;
	gradientIdPrefix: string;
	height: number;
	packages: Array<PackageGroup>;
	queryData: NpmQueryData;
	width: number;
}) {
	const filteredPackageData = getLatestExportPackageData({
		binType,
		packages,
		queryData,
	});
	const latestBarGroups = filteredPackageData
		.map((packageGroup) => ({
			packageGroup,
			name: packageGroup.groupName,
			downloads: d3.sum(packageGroup.downloads, (d) => d.downloads),
		}))
		.filter((group) => group.downloads > 0)
		.sort((a, b) =>
			barSort === 'value'
				? d3.descending(a.downloads, b.downloads) || a.name.localeCompare(b.name)
				: a.name.localeCompare(b.name),
		);
	const latestBarDomain = latestBarGroups.map((group) => group.name);
	const latestGroupedBarData = latestBarGroups.map((group) => ({
		name: group.name,
		seriesName: group.name,
		downloads: group.downloads,
		label: `${group.name}: ${formatNumber(group.downloads)}`,
	}));
	const latestStackedBarData = latestBarGroups.flatMap((group) => {
		let y0 = 0;
		const sortedPackageDownloads = group.packageGroup.packageDownloads
			.map((pkg, packageIndex) => ({
				...pkg,
				packageIndex,
				totalDownloads: d3.sum(pkg.downloads, (d) => d.downloads),
			}))
			.filter((pkg) => pkg.totalDownloads > 0)
			.sort((a, b) => b.totalDownloads - a.totalDownloads);

		return sortedPackageDownloads.map((pkg) => {
			const point = {
				groupName: group.name,
				packageName: pkg.packageName,
				packageIndex: pkg.packageIndex,
				downloads: pkg.totalDownloads,
				y0,
				y1: y0 + pkg.totalDownloads,
				label: `${pkg.packageName}: ${formatNumber(pkg.totalDownloads)}`,
			};
			y0 += pkg.totalDownloads;
			return point;
		});
	});
	const isStackedBar = chartType === 'stacked-bar';
	const isHorizontalBar = barOrientation === 'horizontal';
	const marginRight = 10;
	const marginLeft = isHorizontalBar
		? getCategoricalAxisLeftMargin({ labels: latestBarDomain, width })
		: 70;
	const verticalXAxisLayout = getVerticalCategoricalXAxisLayout({
		height,
		labels: latestBarDomain,
		marginLeft,
		marginRight,
		width,
	});
	const getSeriesColor = (d: { name?: string }) =>
		d.name ? getPackageColor(d.name, packages) : 'currentColor';
	const getSubPackageColor = (d: { groupName: string; packageIndex: number }) =>
		getSubPackageColorForPackages({ ...d, packages });
	const colorLegendEntries = getUniqueColorLegendEntries(
		isStackedBar
			? latestStackedBarData.map((bar) => ({
					label: `${bar.groupName} / ${bar.packageName}`,
					color: getSubPackageColor(bar),
				}))
			: latestGroupedBarData.map((bar) => ({
					label: bar.name,
					color: getPackageColor(bar.name, packages),
				})),
	);
	const fillGradients = getChartFillGradients({
		bottomOpacity: 0.7,
		entries: colorLegendEntries,
		idPrefix: gradientIdPrefix,
		topOpacity: 1,
	});
	const getSeriesGradientFill = (d: { name?: string }) =>
		getChartFillGradientUrl({
			color: getSeriesColor(d),
			gradients: fillGradients,
		});
	const getSubPackageGradientFill = (d: { groupName: string; packageIndex: number }) =>
		getChartFillGradientUrl({
			color: getSubPackageColor(d),
			gradients: fillGradients,
		});
	const plot = Plot.plot({
		marginLeft,
		marginRight,
		marginBottom: isHorizontalBar ? 64 : verticalXAxisLayout.marginBottom,
		width,
		height,
		marks: (
			[
				isHorizontalBar
					? Plot.ruleX([0], {
							stroke: 'currentColor',
							strokeWidth: 1.5,
							strokeOpacity: 0.5,
						})
					: Plot.ruleY([0], {
							stroke: 'currentColor',
							strokeWidth: 1.5,
							strokeOpacity: 0.5,
						}),
				!isStackedBar && !isHorizontalBar
					? Plot.barY(latestGroupedBarData, {
							x: 'name',
							y: 'downloads',
							fill: getSeriesGradientFill,
						})
					: undefined,
				!isStackedBar && isHorizontalBar
					? Plot.barX(latestGroupedBarData, {
							x: 'downloads',
							y: 'name',
							fill: getSeriesGradientFill,
						})
					: undefined,
				isStackedBar && !isHorizontalBar
					? Plot.barY(latestStackedBarData, {
							x: 'groupName',
							y1: 'y0',
							y2: 'y1',
							fill: getSubPackageGradientFill,
						})
					: undefined,
				isStackedBar && isHorizontalBar
					? Plot.barX(latestStackedBarData, {
							y: 'groupName',
							x1: 'y0',
							x2: 'y1',
							fill: getSubPackageGradientFill,
						})
					: undefined,
			] as const
		).filter(Boolean),
		x: {
			domain: isHorizontalBar ? undefined : latestBarDomain,
			label: isHorizontalBar ? 'Downloads' : null,
			labelOffset: isHorizontalBar ? 35 : verticalXAxisLayout.labelOffset,
			tickFormat: isHorizontalBar ? formatCompactAxisNumber : undefined,
			tickRotate: isHorizontalBar ? undefined : verticalXAxisLayout.tickRotate,
		},
		y: {
			domain: isHorizontalBar ? latestBarDomain : undefined,
			label: null,
			labelOffset: 35,
		},
		grid: true,
		color: {
			domain: colorLegendEntries.map((entry) => entry.label),
			range: colorLegendEntries.map((entry) => entry.color),
			legend: false,
		},
	});
	const svg = getPlotSvg(plot);
	if (svg) {
		applyChartFillGradients({ gradients: fillGradients, svg });
	}

	return plot;
}

function getSvgDimensions(svg: SVGSVGElement) {
	const box = svg.getBoundingClientRect();
	const viewBox = svg.viewBox.baseVal;
	const width = svg.width.baseVal.value || viewBox.width || box.width || 1;
	const height = svg.height.baseVal.value || viewBox.height || box.height || 1;

	return {
		width: Math.max(1, Math.ceil(width)),
		height: Math.max(1, Math.ceil(height)),
	};
}

function isTransparentColor(color: string) {
	const normalizedColor = color.trim().toLowerCase();

	return (
		normalizedColor === '' ||
		normalizedColor === 'transparent' ||
		normalizedColor === 'rgba(0, 0, 0, 0)' ||
		normalizedColor === 'rgba(0,0,0,0)' ||
		/^rgba\(.+,\s*0(?:\.0+)?\)$/.test(normalizedColor) ||
		/^rgb\(.+\/\s*0(?:%|\.0+)?\)$/.test(normalizedColor)
	);
}

function getEffectiveBackgroundColor(element: Element) {
	const defaultView = element.ownerDocument.defaultView;
	if (!defaultView) return '#ffffff';

	let current: Element | null = element;
	while (current) {
		const backgroundColor = defaultView.getComputedStyle(current).backgroundColor;
		if (!isTransparentColor(backgroundColor)) {
			return backgroundColor;
		}

		current = current.parentElement;
	}

	const bodyBackgroundColor = defaultView.getComputedStyle(
		element.ownerDocument.body,
	).backgroundColor;
	if (!isTransparentColor(bodyBackgroundColor)) {
		return bodyBackgroundColor;
	}

	return element.ownerDocument.documentElement.classList.contains('dark') ? '#030712' : '#ffffff';
}

function getExportStyle({
	format,
	svg,
}: {
	format: ChartExportFormat;
	svg: SVGSVGElement;
}): ExportStyle {
	const computedStyle = svg.ownerDocument.defaultView?.getComputedStyle(svg);
	const color = computedStyle?.color || 'currentColor';

	return {
		backgroundColor: getEffectiveBackgroundColor(svg),
		backgroundMode: format === 'jpeg' || isAnimatedExportFormat(format) ? 'opaque' : 'transparent',
		color,
	};
}

function getExportLegendItems({
	container,
	showLegend,
}: {
	container: HTMLDivElement | null;
	showLegend: boolean;
}) {
	if (!container || !showLegend) return [];

	return [...container.querySelectorAll<HTMLElement>('[class$="-swatch"]')]
		.map((swatch): ExportLegendItem | undefined => {
			const label = swatch.textContent?.trim();
			const swatchSvg = swatch.querySelector<SVGElement>('svg');
			const color =
				swatchSvg?.getAttribute('fill') ||
				swatchSvg?.style.fill ||
				swatch.querySelector<SVGElement>('[fill]')?.getAttribute('fill');

			if (!label || !color || color === 'none') return undefined;

			return { color, label };
		})
		.filter((item): item is ExportLegendItem => item !== undefined);
}

function getEstimatedLegendLabelWidth(label: string) {
	return Math.ceil(label.length * 5.8);
}

function getLegendLayout({ items, width }: { items: Array<ExportLegendItem>; width: number }) {
	const maxRowWidth = Math.max(1, width - 24);
	const itemGap = 12;
	const rows: Array<ExportLegendLayoutRow> = [];
	let currentRow: ExportLegendLayoutRow = { items: [], width: 0 };

	items.forEach((item) => {
		const itemWidth = 10 + 5 + getEstimatedLegendLabelWidth(item.label);
		const nextWidth = currentRow.items.length ? currentRow.width + itemGap + itemWidth : itemWidth;

		if (currentRow.items.length && nextWidth > maxRowWidth) {
			rows.push(currentRow);
			currentRow = { items: [{ item, width: itemWidth }], width: itemWidth };
			return;
		}

		currentRow.items.push({ item, width: itemWidth });
		currentRow.width = nextWidth;
	});

	if (currentRow.items.length) {
		rows.push(currentRow);
	}

	return {
		height: rows.length ? 12 + rows.length * 14 + (rows.length - 1) * 5 + 8 : 0,
		itemGap,
		maxRowWidth,
		rows,
	};
}

function appendExportLegend({
	exportSvg,
	exportStyle,
	items,
	plotHeight,
	width,
}: {
	exportSvg: SVGSVGElement;
	exportStyle: ExportStyle;
	items: Array<ExportLegendItem>;
	plotHeight: number;
	width: number;
}) {
	if (!items.length) return 0;

	const ownerDocument = exportSvg.ownerDocument;
	const layout = getLegendLayout({ items, width });
	const group = ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
	group.setAttribute('font-family', 'system-ui, sans-serif');
	group.setAttribute('font-size', '10');
	group.setAttribute('fill', exportStyle.color);

	let y = plotHeight + 12;

	layout.rows.forEach((row) => {
		let x = 12 + Math.max(0, (layout.maxRowWidth - row.width) / 2);

		row.items.forEach(({ item, width: itemWidth }, index) => {
			if (index > 0) {
				x += layout.itemGap;
			}

			const rect = ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'rect');
			rect.setAttribute('x', `${x}`);
			rect.setAttribute('y', `${y + 2}`);
			rect.setAttribute('width', '10');
			rect.setAttribute('height', '10');
			rect.setAttribute('fill', item.color);
			group.append(rect);

			const text = ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'text');
			text.setAttribute('x', `${x + 15}`);
			text.setAttribute('y', `${y + 7}`);
			text.setAttribute('dominant-baseline', 'central');
			text.textContent = item.label;
			group.append(text);

			x += itemWidth;
		});

		y += 19;
	});

	exportSvg.append(group);
	return layout.height;
}

function serializeSvg({
	exportStyle,
	legendItems,
	svg,
}: {
	exportStyle: ExportStyle;
	legendItems: Array<ExportLegendItem>;
	svg: SVGSVGElement;
}): SerializedExportSvg | undefined {
	const clone = svg.cloneNode(true);
	if (!(clone instanceof SVGSVGElement)) return undefined;

	const { height, width } = getSvgDimensions(svg);
	const ownerDocument = svg.ownerDocument;
	const exportSvg = ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
	const legendHeight = legendItems.length
		? getLegendLayout({ items: legendItems, width }).height
		: 0;
	const exportHeight = height + legendHeight;
	const background = ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'rect');

	exportSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
	exportSvg.setAttribute('width', `${width}`);
	exportSvg.setAttribute('height', `${exportHeight}`);
	exportSvg.setAttribute('viewBox', `0 0 ${width} ${exportHeight}`);
	exportSvg.style.backgroundColor =
		exportStyle.backgroundMode === 'opaque' ? exportStyle.backgroundColor : 'transparent';
	exportSvg.style.color = exportStyle.color;

	if (exportStyle.backgroundMode === 'opaque') {
		background.setAttribute('width', '100%');
		background.setAttribute('height', '100%');
		background.setAttribute('fill', exportStyle.backgroundColor);
		exportSvg.append(background);
	}

	clone.setAttribute('x', '0');
	clone.setAttribute('y', '0');
	clone.setAttribute('width', `${width}`);
	clone.setAttribute('height', `${height}`);
	clone.style.backgroundColor = 'transparent';
	clone.style.color = exportStyle.color;
	exportSvg.append(clone);

	appendExportLegend({
		exportSvg,
		exportStyle,
		items: legendItems,
		plotHeight: height,
		width,
	});

	return {
		height: exportHeight,
		source: new XMLSerializer().serializeToString(exportSvg),
		width,
	};
}

function downloadBlob({
	blob,
	fileName,
	ownerDocument,
}: {
	blob: Blob;
	fileName: string;
	ownerDocument: Document;
}) {
	const url = URL.createObjectURL(blob);
	const anchor = ownerDocument.createElement('a');
	anchor.href = url;
	anchor.download = fileName;
	anchor.style.display = 'none';
	ownerDocument.body.append(anchor);
	anchor.click();
	anchor.remove();

	const defaultView = ownerDocument.defaultView;
	if (defaultView) {
		defaultView.setTimeout(() => URL.revokeObjectURL(url), 0);
	} else {
		URL.revokeObjectURL(url);
	}
}

function canvasToBlob({
	canvas,
	type,
}: {
	canvas: HTMLCanvasElement;
	type: 'image/png' | 'image/jpeg';
}) {
	return new Promise<Blob | undefined>((resolve) => {
		canvas.toBlob(
			(blob) => {
				resolve(blob ?? undefined);
			},
			type,
			0.92,
		);
	});
}

function waitForMs(defaultView: Window, durationMs: number) {
	return new Promise<void>((resolve) => {
		defaultView.setTimeout(resolve, durationMs);
	});
}

function getAnimatedExportFrameDelayMs(playbackIntervalMs: number | undefined) {
	const interval = playbackIntervalMs ?? animatedExportMaxDelayMs;

	return Math.max(animatedExportMinDelayMs, Math.min(interval, animatedExportMaxDelayMs));
}

function getAnimatedExportBucketOffsets(bounds: LatestBucketOffsetBounds) {
	const bucketCount = bounds.maxOffset - bounds.minOffset + 1;
	if (bucketCount <= 1) return [bounds.maxOffset];
	if (bucketCount <= animatedExportMaxFrames) {
		return d3.range(bounds.minOffset, bounds.maxOffset + 1);
	}

	const offsets: Array<number> = [];
	const seenOffsets = new Set<number>();

	for (let index = 0; index < animatedExportMaxFrames; index++) {
		const progress = index / (animatedExportMaxFrames - 1);
		const offset = Math.round(bounds.minOffset + progress * (bounds.maxOffset - bounds.minOffset));

		if (!seenOffsets.has(offset)) {
			seenOffsets.add(offset);
			offsets.push(offset);
		}
	}

	return offsets;
}

async function drawSerializedSvgToCanvas({
	canvas,
	exportStyle,
	ownerDocument,
	serializedSvg,
}: {
	canvas: HTMLCanvasElement;
	exportStyle: ExportStyle;
	ownerDocument: Document;
	serializedSvg: SerializedExportSvg;
}) {
	const defaultView = ownerDocument.defaultView;
	const ImageConstructor = defaultView?.Image;
	if (!ImageConstructor) return undefined;

	if (canvas.width !== serializedSvg.width || canvas.height !== serializedSvg.height) {
		canvas.width = serializedSvg.width;
		canvas.height = serializedSvg.height;
	}

	const context = canvas.getContext('2d');
	if (!context) return undefined;

	const image = new ImageConstructor();
	const sourceBlob = new Blob([serializedSvg.source], {
		type: 'image/svg+xml;charset=utf-8',
	});
	const sourceUrl = URL.createObjectURL(sourceBlob);

	try {
		const loaded = await new Promise<boolean>((resolve) => {
			image.onload = () => resolve(true);
			image.onerror = () => resolve(false);
			image.src = sourceUrl;
		});
		if (!loaded) return undefined;

		context.setTransform(1, 0, 0, 1, 0, 0);
		context.clearRect(0, 0, serializedSvg.width, serializedSvg.height);
		if (exportStyle.backgroundMode === 'opaque') {
			context.fillStyle = exportStyle.backgroundColor;
			context.fillRect(0, 0, serializedSvg.width, serializedSvg.height);
		}
		context.drawImage(image, 0, 0, serializedSvg.width, serializedSvg.height);

		return context;
	} finally {
		URL.revokeObjectURL(sourceUrl);
	}
}

async function rasterizeSvg({
	exportStyle,
	legendItems,
	svg,
	type,
}: {
	exportStyle: ExportStyle;
	legendItems: Array<ExportLegendItem>;
	svg: SVGSVGElement;
	type: 'image/png' | 'image/jpeg';
}) {
	const serializedSvg = serializeSvg({ exportStyle, legendItems, svg });
	if (!serializedSvg) return undefined;

	const ownerDocument = svg.ownerDocument;
	const defaultView = ownerDocument.defaultView;
	const ImageConstructor = defaultView?.Image;
	if (!ImageConstructor) return undefined;

	const image = new ImageConstructor();
	const sourceBlob = new Blob([serializedSvg.source], {
		type: 'image/svg+xml;charset=utf-8',
	});
	const sourceUrl = URL.createObjectURL(sourceBlob);

	try {
		const loaded = await new Promise<boolean>((resolve) => {
			image.onload = () => resolve(true);
			image.onerror = () => resolve(false);
			image.src = sourceUrl;
		});
		if (!loaded) return undefined;

		const scale = defaultView.devicePixelRatio || 1;
		const canvas = ownerDocument.createElement('canvas');
		canvas.width = serializedSvg.width * scale;
		canvas.height = serializedSvg.height * scale;

		const context = canvas.getContext('2d');
		if (!context) return undefined;

		context.scale(scale, scale);
		if (exportStyle.backgroundMode === 'opaque') {
			context.fillStyle = exportStyle.backgroundColor;
			context.fillRect(0, 0, serializedSvg.width, serializedSvg.height);
		}
		context.drawImage(image, 0, 0, serializedSvg.width, serializedSvg.height);

		return await canvasToBlob({ canvas, type });
	} finally {
		URL.revokeObjectURL(sourceUrl);
	}
}

function getSupportedWebmMimeType(defaultView: Window) {
	const MediaRecorderConstructor = defaultView.MediaRecorder;
	if (!MediaRecorderConstructor) return undefined;

	return (
		['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((mimeType) =>
			MediaRecorderConstructor.isTypeSupported(mimeType),
		) ?? undefined
	);
}

async function encodeGifFrames({
	exportStyle,
	frames,
	ownerDocument,
}: {
	exportStyle: ExportStyle;
	frames: Array<SerializedAnimationFrame>;
	ownerDocument: Document;
}) {
	if (!frames.length) return undefined;

	const canvas = ownerDocument.createElement('canvas');
	const gif = GIFEncoder();

	for (const frame of frames) {
		const context = await drawSerializedSvgToCanvas({
			canvas,
			exportStyle,
			ownerDocument,
			serializedSvg: frame,
		});
		if (!context) return undefined;

		const imageData = context.getImageData(0, 0, frame.width, frame.height);
		const palette = quantize(imageData.data, 256);
		const index = applyPalette(imageData.data, palette);
		gif.writeFrame(index, frame.width, frame.height, {
			delay: frame.delayMs,
			palette,
		});
	}

	gif.finish();
	const bytes = gif.bytes();
	const buffer = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(buffer).set(bytes);

	return new Blob([buffer], { type: 'image/gif' });
}

async function encodeWebmFrames({
	exportStyle,
	frames,
	ownerDocument,
}: {
	exportStyle: ExportStyle;
	frames: Array<SerializedAnimationFrame>;
	ownerDocument: Document;
}) {
	const defaultView = ownerDocument.defaultView;
	if (!defaultView || !frames.length) return undefined;

	const mimeType = getSupportedWebmMimeType(defaultView);
	const MediaRecorderConstructor = defaultView.MediaRecorder;
	if (!mimeType || !MediaRecorderConstructor) return undefined;

	const canvas = ownerDocument.createElement('canvas');
	const firstFrame = frames[0];
	if (!firstFrame) return undefined;
	if (typeof canvas.captureStream !== 'function') return undefined;

	canvas.width = firstFrame.width;
	canvas.height = firstFrame.height;

	const stream = canvas.captureStream(
		1000 / Math.max(animatedExportMinDelayMs, firstFrame.delayMs),
	);
	const recorder = new MediaRecorderConstructor(stream, { mimeType });
	const chunks: Array<Blob> = [];
	const stopped = new Promise<Blob | undefined>((resolve) => {
		recorder.ondataavailable = (event) => {
			if (event.data.size > 0) {
				chunks.push(event.data);
			}
		};
		recorder.onerror = () => resolve(undefined);
		recorder.onstop = () => {
			resolve(chunks.length ? new Blob(chunks, { type: mimeType }) : undefined);
		};
	});
	const videoTrack = stream.getVideoTracks()[0];
	const requestFrame = videoTrack ? Reflect.get(videoTrack, 'requestFrame') : undefined;
	let failed = false;

	recorder.start();

	try {
		for (const frame of frames) {
			const context = await drawSerializedSvgToCanvas({
				canvas,
				exportStyle,
				ownerDocument,
				serializedSvg: frame,
			});
			if (!context) {
				failed = true;
				break;
			}

			if (typeof requestFrame === 'function' && videoTrack) {
				requestFrame.call(videoTrack);
			}
			await waitForMs(defaultView, frame.delayMs);
		}
	} finally {
		if (recorder.state !== 'inactive') {
			recorder.stop();
		}
	}

	const blob = await stopped;
	stream.getTracks().forEach((track) => track.stop());

	return failed ? undefined : blob;
}

function getSnapshotAnimationFrames({
	barOrientation,
	barSort,
	binType,
	bucketOffsetBounds,
	chartType,
	exportStyle,
	gradientIdPrefix,
	height,
	legendItems,
	packages,
	playbackIntervalMs,
	queryData,
	width,
}: {
	barOrientation: BarOrientation;
	barSort: LatestBarSort;
	binType: BinType;
	bucketOffsetBounds: LatestBucketOffsetBounds;
	chartType: ChartType;
	exportStyle: ExportStyle;
	gradientIdPrefix: string;
	height: number;
	legendItems: Array<ExportLegendItem>;
	packages: Array<PackageGroup>;
	playbackIntervalMs: number | undefined;
	queryData: NpmQueryData;
	width: number;
}) {
	const frameDelayMs = getAnimatedExportFrameDelayMs(playbackIntervalMs);

	return getAnimatedExportBucketOffsets(bucketOffsetBounds)
		.map((bucketOffset): SerializedAnimationFrame | undefined => {
			const bucketQueryData = selectLatestBucketQueryData({
				queryData,
				binType,
				bucketOffset,
			});
			if (!bucketQueryData) return undefined;

			const plot = createLatestBarExportPlot({
				barOrientation,
				barSort,
				binType,
				chartType,
				gradientIdPrefix: `${gradientIdPrefix}-frame-${bucketOffset}`,
				height,
				packages,
				queryData: bucketQueryData,
				width,
			});
			const svg = getPlotSvg(plot);
			const serializedSvg = svg ? serializeSvg({ exportStyle, legendItems, svg }) : undefined;
			plot.remove();
			if (!serializedSvg) return undefined;

			return {
				...serializedSvg,
				delayMs: frameDelayMs,
			};
		})
		.filter((frame): frame is SerializedAnimationFrame => frame !== undefined);
}

function renderPlotLegend({
	container,
	plot,
	showLegend,
}: {
	container: HTMLDivElement | null;
	plot: ReturnType<typeof Plot.plot> | null;
	showLegend: boolean;
}) {
	if (!container) return;

	container.replaceChildren();

	if (!showLegend || !plot) return;

	const legend = plot.legend('color', { legend: 'swatches' });
	if (legend) {
		container.append(legend);
	}
}

function ChartActions({
	canExportAnimation,
	disabled,
	embedConfig,
	exportingFormat,
	onExport,
	onToggleLegend,
	showLegend,
}: {
	canExportAnimation: boolean;
	disabled: boolean;
	embedConfig?: NpmStatsChartEmbedConfig;
	exportingFormat: ChartExportFormat | null;
	onExport: (format: ChartExportFormat) => void;
	onToggleLegend: () => void;
	showLegend: boolean;
}) {
	const buttonStyles = twMerge(
		chartActionButtonStyles,
		disabled && 'cursor-not-allowed opacity-50',
	);

	return (
		<div className="flex items-center gap-1">
			<DropdownMenu>
				<Tooltip
					content={
						exportingFormat
							? `Exporting ${getExportFileName(exportingFormat)}`
							: disabled
								? 'Chart export available after render'
								: 'Export chart'
					}
				>
					<DropdownMenuTrigger asChild>
						<button
							aria-label="Export chart"
							className={buttonStyles}
							disabled={disabled}
							type="button"
						>
							<Download className="size-3" />
						</button>
					</DropdownMenuTrigger>
				</Tooltip>
				<DropdownMenuContent
					className={chartActionDropdownContentStyles}
					collisionPadding={8}
					sideOffset={5}
				>
					<div className="mb-1 flex items-center justify-between px-0.5 text-xs font-medium">
						<span>Export</span>
					</div>
					{chartExportOptions
						.filter(({ value }) => canExportAnimation || !isAnimatedExportFormat(value))
						.map(({ label, value }) => (
							<DropdownMenuItem
								className={chartActionDropdownItemStyles}
								disabled={disabled}
								key={value}
								onSelect={() => onExport(value)}
							>
								{label}
							</DropdownMenuItem>
						))}
				</DropdownMenuContent>
			</DropdownMenu>
			<Tooltip
				content={
					disabled
						? 'Plot legend available after render'
						: showLegend
							? 'Hide Plot legend'
							: 'Show Plot legend'
				}
			>
				<button
					aria-label={showLegend ? 'Hide Plot legend' : 'Show Plot legend'}
					aria-pressed={showLegend}
					className={twMerge(buttonStyles, showLegend && 'bg-blue-500/10 text-blue-500')}
					disabled={disabled}
					onClick={onToggleLegend}
					type="button"
				>
					<List className="size-3" />
				</button>
			</Tooltip>
			{embedConfig ? <EmbedChartAction embedConfig={embedConfig} /> : null}
		</div>
	);
}

function getAbsoluteEmbedUrl(url: string) {
	const base = typeof window === 'undefined' ? 'https://tanstack.com' : window.location.origin;

	return new URL(url, base).toString();
}

function CopyButton({
	copied,
	label,
	onCopy,
}: {
	copied: boolean;
	label: string;
	onCopy: () => void;
}) {
	return (
		<button
			className="flex shrink-0 items-center gap-1 rounded bg-gray-500/10 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-500/20 hover:text-blue-500 dark:text-gray-300 dark:hover:text-gray-100"
			onClick={onCopy}
			type="button"
		>
			{copied ? <Check className="size-3" /> : <Copy className="size-3" />}
			{copied ? 'Copied' : label}
		</button>
	);
}

function EmbedOption({
	checked,
	children,
	disabled,
	onCheckedChange,
}: {
	checked: boolean;
	children: React.ReactNode;
	disabled?: boolean;
	onCheckedChange: (checked: boolean) => void;
}) {
	return (
		<label
			className={twMerge(
				'flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200',
				disabled && 'cursor-not-allowed opacity-50',
			)}
		>
			<input
				checked={checked}
				className="size-3.5 accent-blue-500"
				disabled={disabled}
				onChange={(event) => onCheckedChange(event.currentTarget.checked)}
				type="checkbox"
			/>
			<span>{children}</span>
		</label>
	);
}

function EmbedChartAction({ embedConfig }: { embedConfig: NpmStatsChartEmbedConfig }) {
	const [showLegend, setShowLegend] = React.useState(true);
	const [includeTimelineRange, setIncludeTimelineRange] = React.useState(
		embedConfig.hasTimelineRange,
	);
	const [lockWidth, setLockWidth] = React.useState(false);
	const [iframeHeight, setIframeHeight] = React.useState(420);
	const [copiedTarget, setCopiedTarget] = React.useState<'iframe' | 'url' | null>(null);

	React.useEffect(() => {
		if (!embedConfig.hasTimelineRange) {
			setIncludeTimelineRange(false);
		}
	}, [embedConfig.hasTimelineRange]);

	React.useEffect(() => {
		if (!embedConfig.hasWidth) {
			setLockWidth(false);
		}
	}, [embedConfig.hasWidth]);

	const embedUrl = getAbsoluteEmbedUrl(
		embedConfig.buildUrl({
			includeTimelineRange,
			lockWidth,
			showLegend,
		}),
	);
	const iframeCode = `<iframe src="${embedUrl}" title="TanStack NPM Stats chart" loading="lazy" style="width:100%;height:${iframeHeight}px;border:0;"></iframe>`;

	const copyText = React.useCallback(async (target: 'iframe' | 'url', text: string) => {
		await navigator.clipboard.writeText(text);
		setCopiedTarget(target);
		window.setTimeout(() => {
			setCopiedTarget((currentTarget) => (currentTarget === target ? null : currentTarget));
		}, 1500);
	}, []);

	return (
		<DropdownMenu>
			<Tooltip content="Embed chart">
				<DropdownMenuTrigger asChild>
					<button aria-label="Embed chart" className={chartActionButtonStyles} type="button">
						<Code2 className="size-3" />
					</button>
				</DropdownMenuTrigger>
			</Tooltip>
			<DropdownMenuContent
				align="end"
				className="z-50 w-[min(420px,calc(100vw-2rem))] rounded-md bg-white p-3 text-gray-900 shadow-lg dark:bg-gray-800 dark:text-gray-100"
				collisionPadding={8}
				sideOffset={5}
			>
				<div className="space-y-3">
					<div className="flex items-center justify-between gap-3">
						<div className="text-xs font-medium">Embed chart</div>
						<label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
							<span>Iframe height</span>
							<input
								className="w-16 rounded border border-gray-500/20 bg-gray-50 px-1.5 py-1 text-right font-mono text-[11px] outline-none focus:border-blue-500 dark:bg-gray-900"
								max={1200}
								min={240}
								onChange={(event) => {
									const nextHeight = Number(event.currentTarget.value);
									if (!Number.isFinite(nextHeight)) return;
									setIframeHeight(Math.max(240, Math.min(1200, nextHeight)));
								}}
								type="number"
								value={iframeHeight}
							/>
						</label>
					</div>

					<div className="grid gap-1.5">
						<EmbedOption checked={showLegend} onCheckedChange={setShowLegend}>
							Show legend by default
						</EmbedOption>
						<EmbedOption
							checked={includeTimelineRange}
							disabled={!embedConfig.hasTimelineRange}
							onCheckedChange={setIncludeTimelineRange}
						>
							Include current timeline zoom
						</EmbedOption>
						<EmbedOption
							checked={lockWidth}
							disabled={!embedConfig.hasWidth}
							onCheckedChange={setLockWidth}
						>
							Lock current chart width
						</EmbedOption>
					</div>

					<div className="space-y-1.5">
						<div className="flex items-center justify-between gap-2">
							<span className="text-[11px] font-medium text-gray-500">URL</span>
							<CopyButton
								copied={copiedTarget === 'url'}
								label="Copy URL"
								onCopy={() => {
									void copyText('url', embedUrl);
								}}
							/>
						</div>
						<input className={chartEmbedInputStyles} readOnly value={embedUrl} />
					</div>

					<div className="space-y-1.5">
						<div className="flex items-center justify-between gap-2">
							<span className="text-[11px] font-medium text-gray-500">Iframe</span>
							<CopyButton
								copied={copiedTarget === 'iframe'}
								label="Copy iframe"
								onCopy={() => {
									void copyText('iframe', iframeCode);
								}}
							/>
						</div>
						<textarea
							className={twMerge(chartEmbedInputStyles, 'min-h-20 resize-none')}
							readOnly
							value={iframeCode}
						/>
					</div>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function useElementWidth() {
	const containerRef = React.useRef<HTMLDivElement>(null);
	const [width, setWidth] = React.useState(0);

	React.useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const setMeasuredWidth = (nextWidth: number) => {
			setWidth((previousWidth) => (previousWidth === nextWidth ? previousWidth : nextWidth));
		};

		const updateWidth = () => {
			setMeasuredWidth(Math.round(container.getBoundingClientRect().width));
		};

		updateWidth();

		const ownerWindow = container.ownerDocument.defaultView;
		if (!ownerWindow?.ResizeObserver) {
			ownerWindow?.addEventListener('resize', updateWidth);
			return () => {
				ownerWindow?.removeEventListener('resize', updateWidth);
			};
		}

		const resizeObserver = new ownerWindow.ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;

			setMeasuredWidth(Math.round(entry.contentRect.width));
		});

		resizeObserver.observe(container);

		return () => {
			resizeObserver.disconnect();
		};
	}, []);

	return { containerRef, width };
}

function useMeasuredElementHeight<T extends HTMLElement>() {
	const [element, setElement] = React.useState<T | null>(null);
	const [height, setHeight] = React.useState(0);

	const ref = React.useCallback((nextElement: T | null) => {
		setElement(nextElement);
	}, []);

	React.useEffect(() => {
		if (!element) {
			setHeight(0);
			return;
		}

		const setMeasuredHeight = (nextHeight: number) => {
			setHeight((previousHeight) => (previousHeight === nextHeight ? previousHeight : nextHeight));
		};

		const updateHeight = () => {
			setMeasuredHeight(Math.ceil(element.getBoundingClientRect().height));
		};

		updateHeight();

		const ownerWindow = element.ownerDocument.defaultView;
		if (!ownerWindow?.ResizeObserver) {
			ownerWindow?.addEventListener('resize', updateHeight);
			return () => {
				ownerWindow?.removeEventListener('resize', updateHeight);
			};
		}

		const resizeObserver = new ownerWindow.ResizeObserver(updateHeight);
		resizeObserver.observe(element);

		return () => {
			resizeObserver.disconnect();
		};
	}, [element]);

	return { height, ref };
}

function TimelineRangeScrubber({
	dates,
	endIndex,
	marginLeft,
	marginRight,
	onRangeChange,
	startIndex,
}: TimelineRangeScrubberProps) {
	const scrubberRef = React.useRef<HTMLDivElement>(null);
	const [dragState, setDragState] = React.useState<TimelineScrubberDragState | null>(null);
	const [panState, setPanState] = React.useState<TimelineScrubberPanState | null>(null);
	const maxIndex = dates.length - 1;
	if (maxIndex < 1) return null;

	const safeStartIndex = Math.min(clampTimelineIndex(startIndex, maxIndex), maxIndex - 1);
	const safeEndIndex = Math.max(clampTimelineIndex(endIndex, maxIndex), safeStartIndex + 1);
	const displayStartIndex = dragState
		? Math.min(dragState.anchorIndex, dragState.focusIndex)
		: safeStartIndex;
	const displayEndIndex = dragState
		? Math.max(dragState.anchorIndex, dragState.focusIndex)
		: safeEndIndex;
	const startPercent = (displayStartIndex / maxIndex) * 100;
	const endPercent = (displayEndIndex / maxIndex) * 100;
	const middlePercent = (startPercent + endPercent) / 2;
	const startLabel = formatTimelineScrubberDate(dates[safeStartIndex]);
	const endLabel = formatTimelineScrubberDate(dates[safeEndIndex]);
	const isZoomed = safeStartIndex > 0 || safeEndIndex < maxIndex;

	const handleStartChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const nextStartIndex = Math.min(Number(event.currentTarget.value), safeEndIndex - 1);
		onRangeChange(nextStartIndex, safeEndIndex);
	};

	const handleEndChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const nextEndIndex = Math.max(Number(event.currentTarget.value), safeStartIndex + 1);
		onRangeChange(safeStartIndex, nextEndIndex);
	};
	const handleSelectionPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		if (event.button !== 0 || event.target instanceof HTMLInputElement) return;

		event.preventDefault();
		const index = getTimelineIndexFromPointer({
			clientX: event.clientX,
			element: event.currentTarget,
			maxIndex,
		});

		event.currentTarget.setPointerCapture(event.pointerId);
		setDragState({ anchorIndex: index, focusIndex: index });
	};
	const handleSelectionPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!dragState || panState) return;

		const focusIndex = getTimelineIndexFromPointer({
			clientX: event.clientX,
			element: event.currentTarget,
			maxIndex,
		});

		setDragState({ ...dragState, focusIndex });
	};
	const handleSelectionPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!dragState || panState) return;

		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}

		const focusIndex = getTimelineIndexFromPointer({
			clientX: event.clientX,
			element: event.currentTarget,
			maxIndex,
		});
		const start = Math.min(dragState.anchorIndex, focusIndex);
		const end = Math.max(dragState.anchorIndex, focusIndex);
		setDragState(null);

		if (start === end) return;

		onRangeChange(start, end);
	};
	const handleSelectionPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		setDragState(null);
		setPanState(null);
	};
	const handleSelectionDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
		event.preventDefault();
		setDragState(null);
		setPanState(null);
		onRangeChange(0, maxIndex);
	};
	const handlePanPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
		const scrubber = scrubberRef.current;
		if (event.button !== 0 || !scrubber) return;

		event.preventDefault();
		event.stopPropagation();
		const anchorIndex = getTimelineIndexFromPointer({
			clientX: event.clientX,
			element: scrubber,
			maxIndex,
		});

		event.currentTarget.setPointerCapture(event.pointerId);
		setPanState({
			anchorIndex,
			endIndex: safeEndIndex,
			startIndex: safeStartIndex,
		});
	};
	const handlePanPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
		const scrubber = scrubberRef.current;
		if (!panState || !scrubber) return;

		event.preventDefault();
		event.stopPropagation();
		const focusIndex = getTimelineIndexFromPointer({
			clientX: event.clientX,
			element: scrubber,
			maxIndex,
		});
		const delta = focusIndex - panState.anchorIndex;
		const rangeSize = panState.endIndex - panState.startIndex;
		const nextStartIndex = Math.max(0, Math.min(panState.startIndex + delta, maxIndex - rangeSize));
		const nextEndIndex = nextStartIndex + rangeSize;

		if (nextStartIndex !== safeStartIndex || nextEndIndex !== safeEndIndex) {
			onRangeChange(nextStartIndex, nextEndIndex);
		}
	};
	const handlePanPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
		event.stopPropagation();
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		setPanState(null);
	};
	const handlePanPointerCancel = (event: React.PointerEvent<HTMLButtonElement>) => {
		event.stopPropagation();
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		setPanState(null);
	};

	return (
		<div
			className="group relative h-8 cursor-crosshair"
			onDoubleClick={handleSelectionDoubleClick}
			onPointerCancel={handleSelectionPointerCancel}
			onPointerDown={handleSelectionPointerDown}
			onPointerMove={handleSelectionPointerMove}
			onPointerUp={handleSelectionPointerUp}
			ref={scrubberRef}
			style={{ marginLeft, marginRight }}
		>
			<div className="absolute left-0 right-0 top-1/2 h-3 -translate-y-1/2 cursor-crosshair rounded-sm bg-gray-500/10 dark:bg-gray-100/10" />
			<div
				className="absolute top-1/2 h-3 -translate-y-1/2 cursor-crosshair rounded-sm bg-gray-500/20 dark:bg-gray-100/20"
				style={{
					left: `${startPercent}%`,
					right: `${100 - endPercent}%`,
				}}
			/>
			{isZoomed ? (
				<button
					aria-label="Pan timeline zoom range"
					className={twMerge(
						'absolute top-1/2 z-10 hidden h-3 w-6 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center gap-0.5 rounded-sm border border-gray-400 bg-gray-300 text-gray-700 shadow-xs group-hover:flex dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200',
						panState && 'flex cursor-grabbing',
					)}
					onPointerCancel={handlePanPointerCancel}
					onPointerDown={handlePanPointerDown}
					onPointerMove={handlePanPointerMove}
					onPointerUp={handlePanPointerUp}
					style={{ left: `${middlePercent}%` }}
					type="button"
				>
					<span className="h-2 w-px bg-current opacity-80" />
					<span className="h-2 w-px bg-current opacity-80" />
				</button>
			) : null}
			<input
				aria-label="Timeline zoom start"
				aria-valuetext={startLabel}
				className={twMerge(
					timelineScrubberInputStyles,
					timelineScrubberStartInputStyles,
					dragState && 'hidden',
				)}
				max={maxIndex}
				min={0}
				onChange={handleStartChange}
				step={1}
				type="range"
				value={safeStartIndex}
			/>
			<input
				aria-label="Timeline zoom end"
				aria-valuetext={endLabel}
				className={twMerge(
					timelineScrubberInputStyles,
					timelineScrubberEndInputStyles,
					dragState && 'hidden',
				)}
				max={maxIndex}
				min={0}
				onChange={handleEndChange}
				step={1}
				type="range"
				value={safeEndIndex}
			/>
		</div>
	);
}

function PlotFigure({
	barKeys,
	domain,
	domainAxis,
	domainIdentityKey,
	dataUpdateKey,
	fillGradients,
	footer,
	legendRef,
	layoutKey,
	onRenderedChange,
	options,
	plotRef,
	showLegend,
}: {
	barKeys?: Array<string>;
	domain?: Array<string>;
	domainAxis?: CategoricalAxis;
	domainIdentityKey?: string;
	dataUpdateKey?: string;
	fillGradients: Array<ChartFillGradient>;
	footer?: React.ReactNode;
	legendRef: { current: HTMLDivElement | null };
	layoutKey?: string;
	onRenderedChange: (rendered: boolean) => void;
	options: PlotOptions;
	plotRef: { current: ReturnType<typeof Plot.plot> | null };
	showLegend: boolean;
}) {
	const containerRef = React.useRef<HTMLDivElement>(null);
	const domainOrderKeyRef = React.useRef<string | undefined>(undefined);
	const domainIdentityKeyRef = React.useRef<string | undefined>(undefined);
	const dataUpdateKeyRef = React.useRef<string | undefined>(undefined);
	const layoutKeyRef = React.useRef<string | undefined>(undefined);
	const showLegendRef = React.useRef(showLegend);
	const { height: legendHeight, ref: measuredLegendRef } =
		useMeasuredElementHeight<HTMLDivElement>();
	const { height: footerHeight, ref: footerRef } = useMeasuredElementHeight<HTMLDivElement>();
	const sizeRef = React.useRef<{
		height: number | undefined;
		width: number | undefined;
	} | null>(null);

	const setLegendRef = React.useCallback(
		(element: HTMLDivElement | null) => {
			legendRef.current = element;
			measuredLegendRef(element);
		},
		[legendRef, measuredLegendRef],
	);
	const plotOptions = React.useMemo(
		() => ({
			...options,
			height: getPlotContentHeight({
				reservedHeight: legendHeight + footerHeight,
				totalHeight: options.height,
			}),
		}),
		[footerHeight, legendHeight, options],
	);

	React.useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const nextSize = {
			height: plotOptions.height,
			width: plotOptions.width,
		};
		const previousSize = sizeRef.current;
		const sizeChanged =
			previousSize !== null &&
			(previousSize.height !== nextSize.height || previousSize.width !== nextSize.width);

		const commitPlot = (plot: ReturnType<typeof Plot.plot>) => {
			container.replaceChildren(plot);
			plotRef.current = plot;
			onRenderedChange(true);
			renderPlotLegend({
				container: legendRef.current,
				plot,
				showLegend: showLegendRef.current,
			});
			const svg = getPlotSvg(plot);
			if (svg) {
				applyChartFillGradients({ gradients: fillGradients, svg });
			}
			if (svg && domain && domainAxis && barKeys) {
				attachCategoricalDomainUpdater({
					axis: domainAxis,
					barKeys,
					domain,
					svg,
				});
			}
			domainOrderKeyRef.current = domain?.join('\u0000');
			domainIdentityKeyRef.current = domainIdentityKey;
			dataUpdateKeyRef.current = dataUpdateKey;
			layoutKeyRef.current = layoutKey;
			sizeRef.current = nextSize;
		};

		const replacePlot = () => {
			commitPlot(Plot.plot(plotOptions));
		};

		const domainOrderKey = domain?.join('\u0000');
		const domainOrderChanged = domainOrderKeyRef.current !== domainOrderKey;
		const domainIdentityChanged = domainIdentityKeyRef.current !== domainIdentityKey;
		const dataChanged = dataUpdateKeyRef.current !== dataUpdateKey;
		const layoutChanged = layoutKeyRef.current !== layoutKey;

		const plotSvg = getPlotSvg(plotRef.current);

		if (
			domain &&
			domainIdentityKey !== undefined &&
			barKeys &&
			!sizeChanged &&
			!layoutChanged &&
			plotSvg?.updateBarPlot
		) {
			if (domainOrderChanged || domainIdentityChanged || dataChanged) {
				const nextPlot = Plot.plot(plotOptions);
				commitPlot(nextPlot);
				plotSvg.updateBarPlot({
					nextBarKeys: barKeys,
					nextDomain: domain,
					nextPlot,
				});
			}
			return;
		}

		replacePlot();
	}, [
		barKeys,
		dataUpdateKey,
		domain,
		domainAxis,
		domainIdentityKey,
		fillGradients,
		legendRef,
		layoutKey,
		onRenderedChange,
		plotOptions,
		plotRef,
	]);

	React.useEffect(() => {
		showLegendRef.current = showLegend;
		renderPlotLegend({
			container: legendRef.current,
			plot: plotRef.current,
			showLegend,
		});
	}, [legendRef, plotRef, showLegend]);

	React.useEffect(
		() => () => {
			plotRef.current?.remove();
			plotRef.current = null;
			onRenderedChange(false);
		},
		[onRenderedChange, plotRef],
	);

	return (
		<div className="relative" style={{ height: options.height }}>
			<div
				className={twMerge(
					'flex justify-center overflow-x-auto px-2 pb-2 text-xs',
					!showLegend && 'hidden',
				)}
				ref={setLegendRef}
			/>
			<div ref={containerRef} />
			{footer ? (
				<div className="flow-root pt-1" ref={footerRef}>
					{footer}
				</div>
			) : null}
		</div>
	);
}

// Props for the NPMStatsChart component
export type NPMStatsChartProps = {
	actionsContainer?: HTMLElement | null;
	embedConfig?: NpmStatsChartEmbedConfig;
	onActionsMountedChange?: (mounted: boolean) => void;
	queryData: NpmQueryData | undefined;
	height: number;
	viewMode: ViewMode;
	chartType: ChartType;
	barSort: LatestBarSort;
	barOrientation: BarOrientation;
	transform: TransformMode;
	binType: BinType;
	packages: PackageGroup[];
	range: TimeRange;
	showDataMode: ShowDataMode;
	normalizeBaseline?: boolean;
	showBaseline?: boolean;
	showLegend?: boolean;
	timelineEnd?: number;
	timelineStart?: number;
	animationBucketOffsetBounds?: LatestBucketOffsetBounds;
	animationFrameIntervalMs?: number;
	animationQueryData?: NpmQueryData;
	onShowLegendChange?: (showLegend: boolean) => void;
	onTimelineRangeChange?: (range: TimelineRangeValue) => void;
};

export function NPMStatsChart({
	actionsContainer,
	embedConfig,
	onActionsMountedChange,
	queryData,
	height,
	viewMode,
	chartType,
	barSort,
	barOrientation,
	transform,
	binType,
	packages,
	range,
	showDataMode,
	normalizeBaseline = true,
	showBaseline = false,
	showLegend: controlledShowLegend,
	timelineEnd,
	timelineStart,
	animationBucketOffsetBounds,
	animationFrameIntervalMs,
	animationQueryData,
	onShowLegendChange,
	onTimelineRangeChange,
}: NPMStatsChartProps) {
	const { containerRef, width } = useElementWidth();
	const rawGradientId = React.useId();
	const gradientIdPrefix = `npm-stats-fill-${rawGradientId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
	const legendRef = React.useRef<HTMLDivElement>(null);
	const plotRef = React.useRef<ReturnType<typeof Plot.plot> | null>(null);
	const [uncontrolledShowLegend, setUncontrolledShowLegend] = React.useState(false);
	const showLegend = controlledShowLegend ?? uncontrolledShowLegend;
	const showLegendRef = React.useRef(showLegend);
	const [chartRendered, setChartRendered] = React.useState(false);
	const [exportingFormat, setExportingFormat] = React.useState<ChartExportFormat | null>(null);

	React.useEffect(() => {
		showLegendRef.current = showLegend;
	}, [showLegend]);

	React.useEffect(() => {
		if (!actionsContainer) return;

		onActionsMountedChange?.(true);
		return () => {
			onActionsMountedChange?.(false);
		};
	}, [actionsContainer, onActionsMountedChange]);

	const handleChartRenderedChange = React.useCallback((rendered: boolean) => {
		setChartRendered((previousRendered) =>
			previousRendered === rendered ? previousRendered : rendered,
		);
	}, []);
	const canExportAnimation =
		viewMode === 'latest' &&
		!!animationQueryData?.length &&
		!!animationBucketOffsetBounds &&
		animationBucketOffsetBounds.minOffset < animationBucketOffsetBounds.maxOffset;

	const handleExport = React.useCallback(
		async (format: ChartExportFormat) => {
			if (exportingFormat) return;

			const svg = getPlotSvg(plotRef.current);
			if (!svg) return;

			setExportingFormat(format);

			try {
				const exportStyle = getExportStyle({ format, svg });
				const legendItems = getExportLegendItems({
					container: legendRef.current,
					showLegend: showLegendRef.current,
				});

				if (format === 'svg') {
					const serializedSvg = serializeSvg({ exportStyle, legendItems, svg });
					if (!serializedSvg) return;

					downloadBlob({
						blob: new Blob([serializedSvg.source], {
							type: 'image/svg+xml;charset=utf-8',
						}),
						fileName: getExportFileName(format),
						ownerDocument: svg.ownerDocument,
					});
					return;
				}

				if (isAnimatedExportFormat(format)) {
					if (!canExportAnimation || !animationQueryData || !animationBucketOffsetBounds) {
						return;
					}

					const frames = getSnapshotAnimationFrames({
						barOrientation,
						barSort,
						binType,
						bucketOffsetBounds: animationBucketOffsetBounds,
						chartType,
						exportStyle,
						gradientIdPrefix,
						height,
						legendItems,
						packages,
						playbackIntervalMs: animationFrameIntervalMs,
						queryData: animationQueryData,
						width,
					});
					const blob =
						format === 'gif'
							? await encodeGifFrames({
									exportStyle,
									frames,
									ownerDocument: svg.ownerDocument,
								})
							: await encodeWebmFrames({
									exportStyle,
									frames,
									ownerDocument: svg.ownerDocument,
								});
					if (!blob) return;

					downloadBlob({
						blob,
						fileName: getExportFileName(format),
						ownerDocument: svg.ownerDocument,
					});
					return;
				}

				const blob = await rasterizeSvg({
					exportStyle,
					legendItems,
					svg,
					type: format === 'png' ? 'image/png' : 'image/jpeg',
				});
				if (!blob) return;

				downloadBlob({
					blob,
					fileName: getExportFileName(format),
					ownerDocument: svg.ownerDocument,
				});
			} finally {
				setExportingFormat(null);
			}
		},
		[
			animationBucketOffsetBounds,
			animationFrameIntervalMs,
			animationQueryData,
			barOrientation,
			barSort,
			binType,
			canExportAnimation,
			chartType,
			exportingFormat,
			gradientIdPrefix,
			height,
			packages,
			width,
		],
	);

	const handleToggleLegend = React.useCallback(() => {
		const nextShowLegend = !showLegend;

		if (controlledShowLegend === undefined) {
			setUncontrolledShowLegend(nextShowLegend);
		}

		onShowLegendChange?.(nextShowLegend);
	}, [controlledShowLegend, onShowLegendChange, showLegend]);

	const canUseChartActions = chartRendered && !!queryData?.length && width > 0 && !exportingFormat;
	const chartActions = actionsContainer
		? createPortal(
				<ChartActions
					canExportAnimation={canExportAnimation}
					disabled={!canUseChartActions}
					embedConfig={embedConfig}
					exportingFormat={exportingFormat}
					onExport={(format) => {
						void handleExport(format);
					}}
					onToggleLegend={handleToggleLegend}
					showLegend={canUseChartActions && showLegend}
				/>,
				actionsContainer,
			)
		: null;

	if (!queryData?.length) {
		return (
			<div ref={containerRef} className="w-full" style={{ height }}>
				{chartActions}
			</div>
		);
	}

	const binOption = binningOptionsByType[binType];
	const binUnit = binningOptionsByType[binType].bin;
	const effectiveTransform = viewMode === 'history' && chartType === 'line' ? transform : 'none';
	const useBaseline = viewMode === 'history';

	const now = getUtcToday();

	let startDate = (() => {
		if (viewMode === 'latest') {
			const earliestQueryStart = queryData
				.map((pkg) => getUtcDay(new Date(pkg.start)))
				.sort((a, b) => a.getTime() - b.getTime())[0];
			return earliestQueryStart || NPM_STATS_START_DATE;
		}

		switch (range) {
			case 'all-time':
				// Use the actual start date from the query data, or fall back to npm's stats start date
				const earliestActualStartDate = queryData
					.map((pkg) => pkg.actualStartDate)
					.filter((d): d is Date => d !== undefined)
					.sort((a, b) => a.getTime() - b.getTime())[0];
				return earliestActualStartDate || NPM_STATS_START_DATE;
			default:
				return getHistoryStartDate(range, now);
		}
	})();

	startDate = binOption.bin.floor(startDate);

	const combinedPackageGroups = queryData.map((queryPackageGroup, index) => {
		// Get the corresponding package group from the packages prop to get the hidden state
		const packageGroupWithHidden = packages[index];
		const shouldAlwaysIncludeFirstPackage =
			!packageGroupWithHidden ||
			!hasPackageGroupLabel(packageGroupWithHidden) ||
			!!packageGroupWithHidden.baseline;

		// Filter out any sub packages that are hidden before
		// summing them into a unified downloads count
		const visiblePackages = queryPackageGroup.packages.filter((p, i) => {
			const hiddenState = packageGroupWithHidden?.packages.find((pg) => pg.name === p.name)?.hidden;
			return (i === 0 && shouldAlwaysIncludeFirstPackage) || !hiddenState;
		});

		const groupName = packageGroupWithHidden
			? getPackageGroupLabel(packageGroupWithHidden)
			: queryPackageGroup.packages[0]?.name || 'Unknown';
		const downloadsByDate: Map<number, number> = new Map();

		visiblePackages.forEach((pkg) => {
			pkg.downloads.forEach((d) => {
				// Clamp the data to the floor bin of the start date
				const date = getUtcDay(new Date(d.day));
				if (date < startDate) return;

				downloadsByDate.set(
					date.getTime(),
					// Sum the downloads for each date
					(downloadsByDate.get(date.getTime()) || 0) + d.downloads,
				);
			});
		});

		const packageDownloads = visiblePackages.map((pkg) => {
			const packageName = pkg.name || groupName;
			const packageDownloadsByDate: Map<number, number> = new Map();

			pkg.downloads.forEach((d) => {
				const date = getUtcDay(new Date(d.day));
				if (date < startDate) return;

				packageDownloadsByDate.set(
					date.getTime(),
					(packageDownloadsByDate.get(date.getTime()) || 0) + d.downloads,
				);
			});

			return {
				packageName,
				downloads: Array.from(packageDownloadsByDate.entries()).map(([date, downloads]) => ({
					date: getUtcDay(new Date(date)),
					downloads,
				})),
			};
		});

		return {
			...queryPackageGroup,
			label: groupName,
			groupName,
			packageDownloads,
			downloads: Array.from(downloadsByDate.entries()).map(([date, downloads]) => [
				getUtcDay(new Date(date)),
				downloads,
			]) as [Date, number][],
		};
	});

	// Prepare data for plotting
	const binnedPackageData = combinedPackageGroups.map((packageGroup) => {
		// Now apply our binning as groupings
		const binned = d3.sort(
			d3.rollup(
				packageGroup.downloads,
				(v) => d3.sum(v, (d) => d[1]),
				(d) => binUnit.floor(d[0]),
			),
			(d) => d[0],
		);

		const downloads = binned.map((d) => ({
			name: packageGroup.groupName,
			date: getUtcDay(new Date(d[0])),
			downloads: d[1],
		}));

		return {
			...packageGroup,
			downloads,
			packageDownloads: packageGroup.packageDownloads.map((pkg) => {
				const packageBinned = d3.sort(
					d3.rollup(
						pkg.downloads,
						(v) => d3.sum(v, (d) => d.downloads),
						(d) => binUnit.floor(d.date),
					),
					(d) => d[0],
				);

				return {
					...pkg,
					groupName: packageGroup.groupName,
					downloads: packageBinned.map((d) => ({
						groupName: packageGroup.groupName,
						packageName: pkg.packageName,
						date: getUtcDay(new Date(d[0])),
						downloads: d[1],
					})),
				};
			}),
		};
	});

	// Build the baseline divisor.
	//
	// Single-package baseline: divisor[T] = downloads_baseline[T]. Tracked
	// packages divided by this give "% of baseline" — intuitive when there's
	// one familiar reference like react.
	//
	// Multi-package baseline: equal-weighted growth index. Each baseline j is
	// first re-based to its own T0:  ix_j[T] = downloads_j[T] / downloads_j[T0].
	// We average ix across baseline packages to get a unitless multiplier B[T]
	// starting at 1.0 — each member contributes its growth rate equally
	// regardless of size, so the largest member can't dominate the line shape.
	// Tracked packages are then divided by B[T], yielding download values
	// adjusted for baseline growth.
	const baselineGroups = useBaseline
		? binnedPackageData.filter((_, index) => packages[index]?.baseline)
		: [];
	const baselineLineName = getBaselineDisplayName(
		packages.filter((packageGroup) => packageGroup.baseline),
	);
	const isMultiBaseline = baselineGroups.length > 1;

	const baselineDivisorByDate = baselineGroups.length
		? (() => {
				if (!isMultiBaseline) {
					// Single baseline group — divisor is its raw download counts.
					const single = new Map<number, number>();
					baselineGroups[0]?.downloads.forEach((d) => {
						single.set(d.date.getTime(), d.downloads);
					});
					return single;
				}
				// Equal-weighted index: index each baseline to its own T0 then average.
				const perPackageIndex = baselineGroups.map((group) => {
					const t0 = group.downloads[0]?.downloads ?? 0;
					const ix = new Map<number, number>();
					group.downloads.forEach((d) => {
						ix.set(d.date.getTime(), t0 > 0 ? d.downloads / t0 : 1);
					});
					return ix;
				});
				const allDates = new Set<number>();
				perPackageIndex.forEach((ix) => ix.forEach((_, key) => allDates.add(key)));
				const averaged = new Map<number, number>();
				allDates.forEach((key) => {
					let sum = 0;
					let count = 0;
					perPackageIndex.forEach((ix) => {
						const v = ix.get(key);
						if (v !== undefined) {
							sum += v;
							count++;
						}
					});
					if (count > 0) averaged.set(key, sum / count);
				});
				return averaged;
			})()
		: undefined;

	const normalizeByBaseline = useBaseline && !!baselineDivisorByDate && normalizeBaseline;

	const correctedPackageData = binnedPackageData.map((packageGroup) => {
		const first = packageGroup.downloads[0];
		const firstDownloads = first?.downloads ?? 0;

		return {
			...packageGroup,
			downloads: packageGroup.downloads.map((d) => {
				const downloads =
					normalizeByBaseline && baselineDivisorByDate
						? d.downloads / (baselineDivisorByDate.get(d.date.getTime()) || 1)
						: d.downloads;

				return {
					...d,
					downloads,
					change: downloads - firstDownloads,
				};
			}),
		};
	});

	// Filter out any top-level hidden packages. Baseline series stay in the
	// plot when visible — they render as a flat reference line at 1.0 (every
	// point divided by itself) so users can see the baseline alongside the
	// normalized series.
	const filteredPackageData = correctedPackageData.filter((_, index) => {
		const packageGroupWithHidden = packages[index];
		return packageGroupWithHidden ? !isPackageGroupHidden(packageGroupWithHidden) : true;
	});

	const plotData = filteredPackageData.flatMap((d) =>
		d.downloads.map((download) => ({
			...download,
			seriesName: download.name,
		})),
	);

	if (useBaseline && chartType === 'line' && showBaseline && baselineDivisorByDate) {
		const baselinePoints = [...baselineDivisorByDate.entries()]
			.sort((a, b) => a[0] - b[0])
			.map(([time, divisor]) => ({
				name: baselineLineName,
				seriesName: BASELINE_LINE_SERIES,
				date: getUtcDay(new Date(time)),
				// When normalized, baseline / baseline = 1 at every point.
				// When raw, multi-baseline shows the growth-index multiplier (~1.0+);
				// single-baseline shows the raw divisor value (downloads).
				downloads: normalizeByBaseline ? 1 : divisor,
			}));
		const firstBaselineDownloads = baselinePoints[0]?.downloads ?? 0;
		plotData.push(
			...baselinePoints.map((d) => ({
				...d,
				change: d.downloads - firstBaselineDownloads,
			})),
		);
	}

	const baseOptions: Plot.LineYOptions = {
		x: 'date',
		y: effectiveTransform === 'normalize-y' ? 'change' : 'downloads',
	} as const;
	const lineOptions: Plot.LineYOptions = {
		...baseOptions,
		z: 'seriesName',
	};
	const getStrokeColor = (d: { name?: string; seriesName?: string }) => {
		if (d.seriesName === BASELINE_LINE_SERIES) return BASELINE_LINE_COLOR;
		return d.name ? getPackageColor(d.name, packages) : 'currentColor';
	};

	const partialBinEnd = binUnit.floor(now);
	const partialBinStart = binUnit.offset(partialBinEnd, -1);

	// Force complete data mode when using relative change
	const effectiveShowDataMode = effectiveTransform === 'normalize-y' ? 'complete' : showDataMode;
	const completeTimeData =
		effectiveShowDataMode === 'all' ? plotData : plotData.filter((d) => d.date < partialBinEnd);
	const timelineScrubberDates =
		viewMode === 'history'
			? [...new Set(completeTimeData.map((d) => d.date.getTime()))]
					.sort((a, b) => a - b)
					.map((time) => getUtcDay(new Date(time)))
			: [];
	const timelineScrubberMaxIndex = timelineScrubberDates.length - 1;
	const rawTimelineStartIndex =
		timelineScrubberMaxIndex > 0
			? getTimelineIndexForTime({
					dates: timelineScrubberDates,
					fallbackIndex: 0,
					time: timelineStart,
				})
			: 0;
	const timelineStartIndex =
		timelineScrubberMaxIndex > 0
			? Math.min(
					clampTimelineIndex(rawTimelineStartIndex, timelineScrubberMaxIndex),
					timelineScrubberMaxIndex - 1,
				)
			: 0;
	const rawTimelineEndIndex =
		timelineScrubberMaxIndex > 0
			? getTimelineIndexForTime({
					dates: timelineScrubberDates,
					fallbackIndex: timelineScrubberMaxIndex,
					time: timelineEnd,
				})
			: timelineScrubberMaxIndex;
	const timelineEndIndex =
		timelineScrubberMaxIndex > 0
			? clampTimelineIndex(
					Math.max(rawTimelineEndIndex, timelineStartIndex + 1),
					timelineScrubberMaxIndex,
				)
			: timelineScrubberMaxIndex;
	const hasTimelineZoom =
		timelineScrubberMaxIndex > 0 &&
		(timelineStartIndex > 0 || timelineEndIndex < timelineScrubberMaxIndex);
	const timelineZoomDomain = hasTimelineZoom
		? [timelineScrubberDates[timelineStartIndex], timelineScrubberDates[timelineEndIndex]]
		: undefined;
	const seriesOrder = [
		...new Set(filteredPackageData.map((packageGroup) => packageGroup.groupName)),
	];
	const plotDataByDate = new Map<number, Map<string, (typeof plotData)[number]>>();

	plotData.forEach((point) => {
		if (!point.seriesName) return;

		const dateKey = point.date.getTime();
		const dateMap = plotDataByDate.get(dateKey) ?? new Map();
		dateMap.set(point.seriesName, point);
		plotDataByDate.set(dateKey, dateMap);
	});

	const getStackedRowValue = (
		row: StackedDateRow<(typeof plotData)[number]>,
		seriesName: string,
	) => {
		const value = row[seriesName];
		return typeof value === 'number' ? value : 0;
	};

	const stackRows: Array<StackedDateRow<(typeof plotData)[number]>> = [
		...new Set(completeTimeData.map((d) => d.date.getTime())),
	]
		.sort((a, b) => a - b)
		.map((dateKey) => {
			const dateMap = plotDataByDate.get(dateKey);
			const row: StackedDateRow<(typeof plotData)[number]> = {
				date: getUtcDay(new Date(dateKey)),
				pointsBySeries: dateMap ?? new Map(),
			};

			seriesOrder.forEach((seriesName) => {
				row[seriesName] = dateMap?.get(seriesName)?.downloads ?? 0;
			});

			return row;
		});
	const latestStackRow = stackRows[stackRows.length - 1];
	const stackOrder =
		chartType === 'stacked-stream'
			? getInsideOutOrderByLatestValue({
					latestValues: seriesOrder.map((seriesName) =>
						latestStackRow ? getStackedRowValue(latestStackRow, seriesName) : 0,
					),
					sums: seriesOrder.map((seriesName) =>
						d3.sum(stackRows, (row) => getStackedRowValue(row, seriesName)),
					),
				})
			: d3.range(seriesOrder.length);
	const stackOffset =
		chartType === 'stacked-stream'
			? d3.stackOffsetWiggle
			: chartType === 'stacked-area'
				? d3.stackOffsetExpand
				: d3.stackOffsetNone;

	const stackedTimeData = d3
		.stack<StackedDateRow<(typeof plotData)[number]>, string>()
		.keys(seriesOrder)
		.value((row, seriesName) => getStackedRowValue(row, seriesName))
		.order(stackOrder)
		.offset(stackOffset)(stackRows)
		.sort((a, b) => a.index - b.index)
		.flatMap((series) =>
			series.map((segment) => {
				const downloads = getStackedRowValue(segment.data, series.key);
				const totalDownloads = seriesOrder.reduce(
					(sum, seriesName) => sum + getStackedRowValue(segment.data, seriesName),
					0,
				);
				const share = totalDownloads > 0 ? downloads / totalDownloads : 0;

				return {
					name: series.key,
					seriesName: series.key,
					date: segment.data.date,
					downloads,
					y0: segment[0],
					y1: segment[1],
					label:
						chartType === 'stacked-area'
							? `${series.key}: ${formatNumber(downloads)} (${percentFormatter.format(share)})`
							: `${series.key}: ${formatNumber(downloads)}`,
				};
			}),
		);

	const latestBarGroups = filteredPackageData
		.map((packageGroup) => ({
			packageGroup,
			name: packageGroup.groupName,
			downloads: d3.sum(packageGroup.downloads, (d) => d.downloads),
		}))
		.filter((group) => group.downloads > 0)
		.sort((a, b) =>
			barSort === 'value'
				? d3.descending(a.downloads, b.downloads) || a.name.localeCompare(b.name)
				: a.name.localeCompare(b.name),
		);
	const latestBarDomain = latestBarGroups.map((group) => group.name);

	const latestGroupedBarData = latestBarGroups.map((group) => ({
		name: group.name,
		seriesName: group.name,
		downloads: group.downloads,
		label: `${group.name}: ${formatNumber(group.downloads)}`,
	}));
	const latestBarDomainIdentityKey = [...latestBarDomain].sort().join('|');
	const latestGroupedBarDataUpdateKey = latestGroupedBarData
		.map((bar) => `${bar.name}:${bar.downloads}:${getPackageColor(bar.name, packages)}`)
		.sort()
		.join('|');

	const latestStackedBarData = latestBarGroups.flatMap((group) => {
		let y0 = 0;

		const sortedPackageDownloads = group.packageGroup.packageDownloads
			.map((pkg, packageIndex) => ({
				...pkg,
				packageIndex,
				totalDownloads: d3.sum(pkg.downloads, (d) => d.downloads),
			}))
			.filter((pkg) => pkg.totalDownloads > 0)
			.sort((a, b) => b.totalDownloads - a.totalDownloads);

		return sortedPackageDownloads.map((pkg) => {
			const point = {
				groupName: group.name,
				packageName: pkg.packageName,
				packageIndex: pkg.packageIndex,
				downloads: pkg.totalDownloads,
				y0,
				y1: y0 + pkg.totalDownloads,
				label: `${pkg.packageName}: ${formatNumber(pkg.totalDownloads)}`,
			};
			y0 += pkg.totalDownloads;
			return point;
		});
	});
	const getSubPackageColor = (d: { groupName: string; packageIndex: number }) =>
		getSubPackageColorForPackages({ ...d, packages });
	const latestStackedBarDataUpdateKey = latestStackedBarData
		.map(
			(bar) =>
				`${bar.groupName}:${bar.packageName}:${bar.downloads}:${bar.y0}:${
					bar.y1
				}:${getSubPackageColor(bar)}`,
		)
		.sort()
		.join('|');
	const latestBarDataUpdateKey =
		chartType === 'stacked-bar' ? latestStackedBarDataUpdateKey : latestGroupedBarDataUpdateKey;
	const latestBarKeys =
		chartType === 'stacked-bar'
			? latestStackedBarData.map(
					(bar) => `${bar.groupName}\u0000${bar.packageName}\u0000${bar.packageIndex}`,
				)
			: latestGroupedBarData.map((bar) => bar.name);

	const isLatestGroupedBar = viewMode === 'latest' && chartType === 'bar';
	const isLatestStackedBar = viewMode === 'latest' && chartType === 'stacked-bar';
	const isLatestBar = isLatestGroupedBar || isLatestStackedBar;
	const isHorizontalBar = isLatestBar && barOrientation === 'horizontal';
	const isLatestVerticalBar = isLatestBar && barOrientation === 'vertical';
	const marginRight = 10;
	const marginLeft = isHorizontalBar
		? getCategoricalAxisLeftMargin({ labels: latestBarDomain, width })
		: 70;
	const latestVerticalXAxisLayout = getVerticalCategoricalXAxisLayout({
		height,
		labels: latestBarDomain,
		marginLeft,
		marginRight,
		width,
	});
	const xLabel = isHorizontalBar ? 'Downloads' : viewMode === 'latest' ? null : 'Date';
	const yLabel = isHorizontalBar
		? null
		: chartType === 'stacked-area'
			? 'Download Share'
			: chartType === 'stacked-stream'
				? 'Downloads (stream)'
				: effectiveTransform === 'normalize-y'
					? 'Downloads Growth'
					: normalizeByBaseline
						? isMultiBaseline
							? 'Downloads (indexed)'
							: 'Downloads (% of baseline)'
						: 'Downloads';
	const usePercentYAxis =
		chartType === 'stacked-area' ||
		(normalizeByBaseline && !isMultiBaseline && effectiveTransform !== 'normalize-y');
	const yTickFormat = isHorizontalBar
		? undefined
		: usePercentYAxis
			? (value: number) => percentFormatter.format(value)
			: formatCompactAxisNumber;
	const xTickFormat = isHorizontalBar ? formatCompactAxisNumber : undefined;
	const colorLegendEntries = getUniqueColorLegendEntries(
		isLatestStackedBar
			? latestStackedBarData.map((bar) => ({
					label: `${bar.groupName} / ${bar.packageName}`,
					color: getSubPackageColor(bar),
				}))
			: isLatestGroupedBar
				? latestGroupedBarData.map((bar) => ({
						label: bar.name,
						color: getPackageColor(bar.name, packages),
					}))
				: plotData
						.map((d) => d.name)
						.filter((name): name is string => name !== undefined)
						.map((name) => ({
							label: name,
							color:
								name === baselineLineName ? BASELINE_LINE_COLOR : getPackageColor(name, packages),
						})),
	);
	const useHistoryAreaFill =
		viewMode === 'history' &&
		(chartType === 'stacked' || chartType === 'stacked-area' || chartType === 'stacked-stream');
	const fillGradients = getChartFillGradients({
		bottomOpacity: isLatestBar ? 0.7 : useHistoryAreaFill ? 0.25 : 0.1,
		entries: colorLegendEntries,
		idPrefix: gradientIdPrefix,
		topOpacity: isLatestBar ? 1 : useHistoryAreaFill ? 0.9 : 0.8,
	});
	const getSeriesGradientFill = (d: { name?: string; seriesName?: string }) =>
		getChartFillGradientUrl({
			color: getStrokeColor(d),
			gradients: fillGradients,
		});
	const getSubPackageGradientFill = (d: { groupName: string; packageIndex: number }) =>
		getChartFillGradientUrl({
			color: getSubPackageColor(d),
			gradients: fillGradients,
		});

	return (
		<div ref={containerRef} className="w-full">
			{chartActions}
			{width > 0 ? (
				<PlotFigure
					barKeys={isLatestBar ? latestBarKeys : undefined}
					domain={isLatestBar ? latestBarDomain : undefined}
					domainAxis={isLatestBar ? (barOrientation === 'vertical' ? 'x' : 'y') : undefined}
					domainIdentityKey={isLatestBar ? latestBarDomainIdentityKey : undefined}
					dataUpdateKey={isLatestBar ? latestBarDataUpdateKey : undefined}
					fillGradients={fillGradients}
					footer={
						viewMode === 'history' && timelineScrubberMaxIndex > 0 ? (
							<TimelineRangeScrubber
								dates={timelineScrubberDates}
								endIndex={timelineEndIndex}
								marginLeft={marginLeft}
								marginRight={marginRight}
								onRangeChange={(nextStartIndex, nextEndIndex) => {
									if (nextStartIndex <= 0 && nextEndIndex >= timelineScrubberMaxIndex) {
										onTimelineRangeChange?.({
											end: undefined,
											start: undefined,
										});
										return;
									}

									onTimelineRangeChange?.({
										end: timelineScrubberDates[nextEndIndex]?.getTime(),
										start: timelineScrubberDates[nextStartIndex]?.getTime(),
									});
								}}
								startIndex={timelineStartIndex}
							/>
						) : null
					}
					legendRef={legendRef}
					layoutKey={isLatestBar ? `${chartType}:${barOrientation}` : undefined}
					onRenderedChange={handleChartRenderedChange}
					plotRef={plotRef}
					showLegend={showLegend}
					options={{
						className: observablePlotClassName,
						marginLeft,
						marginRight,
						marginBottom: isLatestVerticalBar ? latestVerticalXAxisLayout.marginBottom : 70,
						width,
						height,
						style: { overflow: 'visible' },
						marks: (
							[
								isHorizontalBar
									? Plot.ruleX([0], {
											stroke: 'currentColor',
											strokeWidth: 1.5,
											strokeOpacity: 0.5,
										})
									: Plot.ruleY([0], {
											stroke: 'currentColor',
											strokeWidth: 1.5,
											strokeOpacity: 0.5,
										}),
								viewMode === 'history' && chartType === 'line' && effectiveShowDataMode === 'all'
									? Plot.lineY(
											plotData.filter((d) => d.date >= partialBinStart),
											{
												...lineOptions,
												stroke: getStrokeColor,
												strokeWidth: 1.5,
												strokeDasharray: '2 4',
												strokeOpacity: 0.8,
												curve: 'monotone-x',
												clip: hasTimelineZoom ? true : undefined,
											},
										)
									: undefined,
								viewMode === 'history' && chartType === 'line'
									? Plot.lineY(
											plotData.filter((d) => d.date < partialBinEnd),
											{
												...lineOptions,
												stroke: getStrokeColor,
												strokeWidth: 2,
												curve: 'monotone-x',
												clip: hasTimelineZoom ? true : undefined,
											},
										)
									: undefined,
								viewMode === 'history' && chartType === 'line'
									? Plot.tip(
											completeTimeData,
											Plot.pointer({
												...baseOptions,
												stroke: 'name',
												format: {
													x: (d) =>
														d.toLocaleDateString('en-US', {
															month: 'long',
															day: 'numeric',
															year: 'numeric',
														}),
												},
											} as Plot.TipOptions),
										)
									: undefined,
								viewMode === 'history' && (chartType === 'stacked' || chartType === 'stacked-area')
									? Plot.areaY(stackedTimeData, {
											x: 'date',
											y1: 'y0',
											y2: 'y1',
											z: 'seriesName',
											fill: getSeriesGradientFill,
											curve: 'monotone-x',
											clip: hasTimelineZoom ? true : undefined,
										})
									: undefined,
								viewMode === 'history' && chartType === 'stacked-stream'
									? Plot.areaY(stackedTimeData, {
											x: 'date',
											y1: 'y0',
											y2: 'y1',
											z: 'seriesName',
											fill: getSeriesGradientFill,
											curve: 'monotone-x',
											clip: hasTimelineZoom ? true : undefined,
										})
									: undefined,
								viewMode === 'history' &&
								(chartType === 'stacked' ||
									chartType === 'stacked-area' ||
									chartType === 'stacked-stream')
									? Plot.lineY(stackedTimeData, {
											x: 'date',
											y: 'y1',
											z: 'seriesName',
											stroke: getStrokeColor,
											strokeWidth: 1.4,
											strokeOpacity: 0.95,
											curve: 'monotone-x',
											clip: hasTimelineZoom ? true : undefined,
										})
									: undefined,
								viewMode === 'history' &&
								(chartType === 'stacked' ||
									chartType === 'stacked-area' ||
									chartType === 'stacked-stream')
									? Plot.tip(
											stackedTimeData,
											Plot.pointerX({
												x: 'date',
												y1: 'y0',
												y2: 'y1',
												title: 'label',
												maxRadius: 80,
												format: {
													x: (d) =>
														d.toLocaleDateString('en-US', {
															month: 'long',
															day: 'numeric',
															year: 'numeric',
														}),
												},
											}),
										)
									: undefined,
								isLatestGroupedBar && barOrientation === 'vertical'
									? Plot.barY(latestGroupedBarData, {
											x: 'name',
											y: 'downloads',
											fill: getSeriesGradientFill,
										})
									: undefined,
								isLatestGroupedBar && barOrientation === 'vertical'
									? Plot.tip(
											latestGroupedBarData,
											Plot.pointerX({
												x: 'name',
												y1: 0,
												y2: 'downloads',
												title: 'label',
												maxRadius: 80,
											}),
										)
									: undefined,
								isLatestGroupedBar && barOrientation === 'horizontal'
									? Plot.barX(latestGroupedBarData, {
											x: 'downloads',
											y: 'name',
											fill: getSeriesGradientFill,
										})
									: undefined,
								isLatestGroupedBar && barOrientation === 'horizontal'
									? Plot.tip(
											latestGroupedBarData,
											Plot.pointerY({
												x1: 0,
												x2: 'downloads',
												y: 'name',
												title: 'label',
												maxRadius: 80,
											}),
										)
									: undefined,
								isLatestStackedBar && barOrientation === 'vertical'
									? Plot.barY(latestStackedBarData, {
											x: 'groupName',
											y1: 'y0',
											y2: 'y1',
											fill: getSubPackageGradientFill,
										})
									: undefined,
								isLatestStackedBar && barOrientation === 'vertical'
									? Plot.tip(
											latestStackedBarData,
											Plot.pointerX({
												x: 'groupName',
												y1: 'y0',
												y2: 'y1',
												title: 'label',
												maxRadius: 80,
											}),
										)
									: undefined,
								isLatestStackedBar && barOrientation === 'horizontal'
									? Plot.barX(latestStackedBarData, {
											y: 'groupName',
											x1: 'y0',
											x2: 'y1',
											fill: getSubPackageGradientFill,
										})
									: undefined,
								isLatestStackedBar && barOrientation === 'horizontal'
									? Plot.tip(
											latestStackedBarData,
											Plot.pointerY({
												x1: 'y0',
												x2: 'y1',
												y: 'groupName',
												title: 'label',
												maxRadius: 80,
											}),
										)
									: undefined,
							] as const
						).filter(Boolean),
						x: {
							domain: isLatestVerticalBar ? latestBarDomain : timelineZoomDomain,
							label: xLabel,
							labelOffset: isLatestVerticalBar ? latestVerticalXAxisLayout.labelOffset : 35,
							tickFormat: xTickFormat,
							tickRotate: isLatestVerticalBar ? latestVerticalXAxisLayout.tickRotate : undefined,
						},
						y: {
							domain: isHorizontalBar ? latestBarDomain : undefined,
							label: yLabel,
							labelOffset: 35,
							tickFormat: yTickFormat,
						},
						grid: true,
						color: {
							domain: colorLegendEntries.map((entry) => entry.label),
							range: colorLegendEntries.map((entry) => entry.color),
							legend: false,
						},
					}}
				/>
			) : (
				<div style={{ height }} />
			)}
		</div>
	);
}
