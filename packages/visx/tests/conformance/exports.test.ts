import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as localRoot from '@octanejs/visx';
import * as localChord from '@octanejs/visx/chord';
import * as localDelaunay from '@octanejs/visx/delaunay';
import * as localReactSpring from '@octanejs/visx/react-spring';
import * as localSankey from '@octanejs/visx/sankey';
import * as localStats from '@octanejs/visx/stats';
import * as localA11y from '@octanejs/visx/a11y';
import * as localA11yReact from '@octanejs/visx/a11y/react';
import * as localA11yServer from '@octanejs/visx/a11y/server';
import * as localAxisReact from '@octanejs/visx/axis/react';
import * as localChart from '@octanejs/visx/chart';
import * as localKernel from '@octanejs/visx/kernel';
import * as localScaleReact from '@octanejs/visx/scale/react';
import * as localShapeReact from '@octanejs/visx/shape/react';
import * as localTheme from '@octanejs/visx/theme';
import * as localThemeReact from '@octanejs/visx/theme/react';
import * as localTooltipFloating from '@octanejs/visx/tooltip/floating';
import * as localVoronoiReact from '@octanejs/visx/voronoi/react';
import * as upstreamRoot from '@visx/visx';
import * as upstreamChord from '@visx/chord';
import * as upstreamDelaunay from '@visx/delaunay';
import * as upstreamReactSpring from '@visx/react-spring';
import * as upstreamSankey from '@visx/sankey';
import * as upstreamStats from '@visx/stats';

const stableAggregateNamespaces = [
	'Annotation',
	'Axis',
	'Bounds',
	'Brush',
	'ClipPath',
	'Curve',
	'Drag',
	'Event',
	'Geo',
	'Glyph',
	'Gradient',
	'Grid',
	'Group',
	'Heatmap',
	'Hierarchy',
	'Legend',
	'Marker',
	'MockData',
	'Network',
	'Pattern',
	'Point',
	'Responsive',
	'Scale',
	'Shape',
	'Text',
	'Threshold',
	'Tooltip',
	'Voronoi',
	'Wordcloud',
	'XYChart',
	'Zoom',
] as const;

const currentMasterPins = [
	[
		'a11y',
		localA11y,
		[
			'DEFAULT_CHART_A11Y_ID_PREFIX',
			'DEFAULT_POINT_DESCRIPTION_THRESHOLD',
			'DEFAULT_SINGLE_SERIES_LABEL',
			'generateChartDescription',
			'generateDataTableHTML',
			'getChartAriaProps',
			'normalizeChartA11yData',
		],
	],
	[
		'a11y/react',
		localA11yReact,
		[
			'ChartA11yAnnouncer',
			'ChartA11yDataTable',
			'DEFAULT_CHART_A11Y_ID_PREFIX',
			'DEFAULT_POINT_DESCRIPTION_THRESHOLD',
			'DEFAULT_SINGLE_SERIES_LABEL',
			'generateChartDescription',
			'generateDataTableHTML',
			'getChartAriaProps',
			'normalizeChartA11yData',
			'useChartA11y',
			'useChartKeyboardNav',
		],
	],
	[
		'a11y/server',
		localA11yServer,
		[
			'DEFAULT_CHART_A11Y_ID_PREFIX',
			'DEFAULT_POINT_DESCRIPTION_THRESHOLD',
			'DEFAULT_SINGLE_SERIES_LABEL',
			'generateChartDescription',
			'generateDataTableHTML',
			'getChartAriaProps',
			'normalizeChartA11yData',
		],
	],
	['axis/react', localAxisReact, ['useAxis']],
	[
		'chart',
		localChart,
		[
			'getAxisTickCount',
			'getChartConfigColor',
			'getChartConfigEntry',
			'getChartConfigIcon',
			'getChartConfigLabel',
			'getChartCssVariableName',
			'getChartCssVariables',
			'getPaddedDomain',
			'getPositiveDomain',
			'getResponsiveWidth',
			'getVisibleTickValues',
			'getZeroBaselineDomain',
			'isFiniteNumber',
			'useChartDimensions',
		],
	],
	[
		'kernel',
		localKernel,
		[
			'createPath',
			'formatNumber',
			'normalizeAccessor',
			'setWarnHandler',
			'toPath2D',
			'useDomain',
			'useLatestRef',
			'useStableCallback',
			'useStableId',
			'useStructuralMemo',
		],
	],
	['scale/react', localScaleReact, ['useScale']],
	['shape/react', localShapeReact, ['usePie']],
	[
		'theme',
		localTheme,
		[
			'createRuntimeTheme',
			'createThemeStyle',
			'cssVar',
			'darkTheme',
			'defineTheme',
			'fromXYChartTheme',
			'lightTheme',
			'ThemeScope',
		],
	],
	[
		'theme/react',
		localThemeReact,
		[
			'ThemeProvider',
			'useAxisStyle',
			'useCategoricalScale',
			'useChartConfig',
			'useColor',
			'useColorScale',
			'useGridStyle',
			'useTheme',
		],
	],
	[
		'tooltip/floating',
		localTooltipFloating,
		[
			'buildFloatingTooltipMiddleware',
			'ChartTooltip',
			'ChartTooltipContent',
			'FloatingTooltip',
			'getTooltipAnchorReference',
			'useChartTooltip',
			'useFloatingTooltip',
		],
	],
	['voronoi/react', localVoronoiReact, ['useVoronoi']],
] as const;

const sortedKeys = (value: object) => Object.keys(value).sort();
const packageManifest = JSON.parse(
	readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8'),
);
const publicEntryPoints = [
	'.',
	'./a11y',
	'./a11y/react',
	'./a11y/server',
	'./annotation',
	'./axis',
	'./axis/react',
	'./bounds',
	'./brush',
	'./chart',
	'./chord',
	'./clip-path',
	'./curve',
	'./delaunay',
	'./drag',
	'./event',
	'./geo',
	'./glyph',
	'./gradient',
	'./grid',
	'./group',
	'./heatmap',
	'./hierarchy',
	'./kernel',
	'./legend',
	'./marker',
	'./mock-data',
	'./network',
	'./pattern',
	'./point',
	'./react-spring',
	'./responsive',
	'./sankey',
	'./scale',
	'./scale/react',
	'./shape',
	'./shape/react',
	'./stats',
	'./text',
	'./theme',
	'./theme/react',
	'./threshold',
	'./tooltip',
	'./tooltip/floating',
	'./voronoi',
	'./voronoi/react',
	'./wordcloud',
	'./xychart',
	'./zoom',
] as const;
const currentMasterAggregateAdditions: Partial<
	Record<(typeof stableAggregateNamespaces)[number], string[]>
> = {
	Shape: ['arcPath', 'areaPath', 'linePath'],
};

describe('@octanejs/visx public runtime export parity', () => {
	it('ships exactly the 49 audited public entry points', () => {
		expect(Object.keys(packageManifest.exports).sort()).toEqual([...publicEntryPoints].sort());
	});

	it('matches the released aggregate in both directions for all 31 namespaces', () => {
		expect(sortedKeys(upstreamRoot)).toEqual([...stableAggregateNamespaces].sort());
		for (const namespace of stableAggregateNamespaces) {
			expect(sortedKeys(localRoot[namespace]), namespace).toEqual(
				[
					...sortedKeys(upstreamRoot[namespace]),
					...(currentMasterAggregateAdditions[namespace] ?? []),
				].sort(),
			);
		}
	});

	it('matches all five released direct-only packages in both directions', () => {
		const pairs = [
			['chord', localChord, upstreamChord],
			['delaunay', localDelaunay, upstreamDelaunay],
			['react-spring', localReactSpring, upstreamReactSpring],
			['sankey', localSankey, upstreamSankey],
			['stats', localStats, upstreamStats],
		] as const;
		for (const [entry, local, upstream] of pairs) {
			expect(sortedKeys(local), entry).toEqual(sortedKeys(upstream));
		}
	});

	it('pins the exact current-master runtime surface for all 12 added entry points', () => {
		for (const [entry, local, expected] of currentMasterPins) {
			expect(sortedKeys(local), entry).toEqual([...expected].sort());
		}
	});

	it('pins the exact 35-namespace current aggregate without extras or omissions', () => {
		expect(sortedKeys(localRoot)).toEqual(
			[...stableAggregateNamespaces, 'A11y', 'Chart', 'Kernel', 'Theme'].sort(),
		);
	});
});
