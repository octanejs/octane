// Vendored verbatim from recharts@3.9.2 es6/state/selectors/legendSelectors.js (framework-agnostic).
// Do not edit — update by re-vendoring when the recharts devDependency moves.
// Sanctioned deviation: es-toolkit compat imports normalized to the ESM barrel
// ('es-toolkit/compat') — the per-function subpaths are CJS-only and break
// consumers that compile this binding from source (vite dev prebundle).
import { createSelector } from 'reselect';
import { sortBy } from 'es-toolkit/compat';
export var selectLegendSettings = (state) => state.legend.settings;
export var selectLegendSize = (state) => state.legend.size;
var selectAllLegendPayload2DArray = (state) => state.legend.payload;
export var selectLegendPayload = createSelector(
	[selectAllLegendPayload2DArray, selectLegendSettings],
	(payloads, _ref) => {
		var itemSorter = _ref.itemSorter;
		var flat = payloads.flat(1);
		return itemSorter ? sortBy(flat, itemSorter) : flat;
	},
);
