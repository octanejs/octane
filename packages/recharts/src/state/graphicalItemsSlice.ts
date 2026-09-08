// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import { createSlice, current, PayloadAction, prepareAutoBatched } from '@reduxjs/toolkit';
import { castDraft, type Draft } from 'immer';
import { ChartData } from './chartDataSlice';
import { AxisId } from './cartesianAxisSlice';
import { DataKey } from '../util/types';
import { LineSettings } from './types/LineSettings';
import { ScatterSettings } from './types/ScatterSettings';
import { AreaSettings } from './types/AreaSettings';
import { BarSettings } from './types/BarSettings';
import { RadialBarSettings } from './types/RadialBarSettings';
import { PieSettings } from './types/PieSettings';
import { RadarSettings } from './types/RadarSettings';

/**
 * Unique ID of the graphical item.
 * This is used to identify the graphical item in the state and in the React tree.
 * This is required for every graphical item - it's either provided by the user or generated automatically.
 */
export type GraphicalItemId = string;

export interface GraphicalItemSettings {
	/**
	 * Unique ID of the graphical item.
	 * This is used to identify the graphical item in the state and in the React tree.
	 * This is required for every graphical item - it's either provided by the user or generated automatically.
	 */
	id: GraphicalItemId;
	/**
	 * If the given graphical item has its own data array, it will appear here.
	 * If this is undefined, the data will be taken from the chart root prop.
	 */
	data: ChartData | undefined;
	dataKey: DataKey<any> | undefined;
	/**
	 * Why not just stop pushing the graphical items to state when they are hidden?
	 * Well some components decide to continue showing them anyway.
	 * Legend for example will keep showing a record for hidden graphical items.
	 * Stacks for example will ignore them.
	 */
	hide: boolean;
}

export interface BaseCartesianGraphicalItemSettings extends GraphicalItemSettings {
	/**
	 * Each of the graphical items explicitly says which axis it uses;
	 * this property is optional for users but every graphical item must have a default,
	 * and it is required here.
	 */
	xAxisId: AxisId;
	yAxisId: AxisId;
	zAxisId: AxisId;
	/**
	 * Graphical items that are inside Brush panorama should not interact with the main area graphical items
	 * and vice versa.
	 */
	isPanorama: boolean;
}

export type CartesianGraphicalItemSettings =
	AreaSettings | BarSettings | LineSettings | ScatterSettings;

export interface BasePolarGraphicalItemSettings extends GraphicalItemSettings {
	angleAxisId: AxisId;
	radiusAxisId: AxisId;
}

export type PolarGraphicalItemSettings = PieSettings | RadarSettings | RadialBarSettings;

export type GraphicalItemsState = {
	/**
	 * This is an array of all cartesian graphical items and their settings.
	 * Graphical item is a visual representation of data on the chart.
	 * Some examples are: Line, Bar.
	 *
	 * The order is arbitrary; do not expect that indexes here will be the same as indexes elsewhere.
	 */
	cartesianItems: ReadonlyArray<CartesianGraphicalItemSettings>;
	/**
	 * This is an array of all polar graphical items and their settings.
	 * Graphical item is a visual representation of data on the chart.
	 * Some examples are: Pie, Radar, RadialBar
	 *
	 * The order is arbitrary; do not expect that indexes here will be the same as indexes elsewhere.
	 */
	polarItems: ReadonlyArray<PolarGraphicalItemSettings>;
};

const initialState: GraphicalItemsState = {
	cartesianItems: [],
	polarItems: [],
};

type ReplacePayload<T> = {
	prev: T;
	next: T;
};

// Registered props may contain native DOM refs. The private callback boundary
// avoids RTK's prepared-action validator recursively comparing raw DOM-backed
// settings with Draft<Settings>. Every access still uses the exact known draft;
// the exported reducer state and action payloads remain fully typed.
const graphicalItemsSlice = createSlice({
	name: 'graphicalItems',
	initialState,
	reducers: {
		addCartesianGraphicalItem: {
			reducer(state: unknown, action: PayloadAction<CartesianGraphicalItemSettings>) {
				(state as Draft<GraphicalItemsState>).cartesianItems.push(castDraft(action.payload));
			},
			prepare: prepareAutoBatched<CartesianGraphicalItemSettings>(),
		},
		replaceCartesianGraphicalItem: {
			reducer(
				state: unknown,
				action: PayloadAction<ReplacePayload<CartesianGraphicalItemSettings>>,
			) {
				const { prev, next } = action.payload;
				const index = current(state as Draft<GraphicalItemsState>).cartesianItems.indexOf(
					castDraft(prev),
				);
				if (index > -1) {
					(state as Draft<GraphicalItemsState>).cartesianItems[index] = castDraft(next);
				}
			},
			prepare: prepareAutoBatched<ReplacePayload<CartesianGraphicalItemSettings>>(),
		},
		removeCartesianGraphicalItem: {
			reducer(state: unknown, action: PayloadAction<CartesianGraphicalItemSettings>) {
				const index = current(state as Draft<GraphicalItemsState>).cartesianItems.indexOf(
					castDraft(action.payload),
				);
				if (index > -1) {
					(state as Draft<GraphicalItemsState>).cartesianItems.splice(index, 1);
				}
			},
			prepare: prepareAutoBatched<CartesianGraphicalItemSettings>(),
		},
		addPolarGraphicalItem: {
			reducer(state: unknown, action: PayloadAction<PolarGraphicalItemSettings>) {
				(state as Draft<GraphicalItemsState>).polarItems.push(castDraft(action.payload));
			},
			prepare: prepareAutoBatched<PolarGraphicalItemSettings>(),
		},
		removePolarGraphicalItem: {
			reducer(state: unknown, action: PayloadAction<PolarGraphicalItemSettings>) {
				const index = current(state as Draft<GraphicalItemsState>).polarItems.indexOf(
					castDraft(action.payload),
				);
				if (index > -1) {
					(state as Draft<GraphicalItemsState>).polarItems.splice(index, 1);
				}
			},
			prepare: prepareAutoBatched<PolarGraphicalItemSettings>(),
		},
		replacePolarGraphicalItem: {
			reducer(state: unknown, action: PayloadAction<ReplacePayload<PolarGraphicalItemSettings>>) {
				const { prev, next } = action.payload;
				const index = current(state as Draft<GraphicalItemsState>).polarItems.indexOf(
					castDraft(prev),
				);
				if (index > -1) {
					(state as Draft<GraphicalItemsState>).polarItems[index] = castDraft(next);
				}
			},
			prepare: prepareAutoBatched<ReplacePayload<PolarGraphicalItemSettings>>(),
		},
	},
});

export const {
	addCartesianGraphicalItem,
	replaceCartesianGraphicalItem,
	removeCartesianGraphicalItem,
	addPolarGraphicalItem,
	removePolarGraphicalItem,
	replacePolarGraphicalItem,
} = graphicalItemsSlice.actions;

export const graphicalItemsReducer = graphicalItemsSlice.reducer;
