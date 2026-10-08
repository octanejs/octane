import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { importNativeTypeScript } from '../../../scripts/octane-tsc/native.mjs';

const { API, SymbolFlags } = await importNativeTypeScript('unstable/sync');

const packageRoot = resolve(import.meta.dirname, '..');
const configPath = resolve(packageRoot, 'tsconfig.json');
const containingFile = resolve(packageRoot, 'tests/types/parity.test-d.ts');

const stableNamespaces = [
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
];

const currentAdditionsToStableNamespaces = {
	Shape: ['arcPath', 'areaPath', 'linePath'],
	Voronoi: ['VoronoiConfig'],
};

const words = (value) => value.trim().split(/\s+/).sort();

// Exact value + type-only symbol inventories from Airbnb Visx master
// 485c0359664ee8e612992defb16e1f035ed40b23. Keeping these independent of
// the port makes both a missing export and an accidental extra fail the gate.
const currentMasterEntries = {
	a11y: words(`
		DEFAULT_CHART_A11Y_ID_PREFIX DEFAULT_POINT_DESCRIPTION_THRESHOLD DEFAULT_SINGLE_SERIES_LABEL
		generateChartDescription generateDataTableHTML getChartAriaProps normalizeChartA11yData
		A11yLocale ChartA11yAccessor ChartA11yConfig ChartA11yFlatConfig ChartA11yFocusedPoint
		ChartA11yFormatter ChartA11yIds ChartA11yKeyboardIntent ChartA11yKeyboardState ChartA11yMode
		ChartA11yNestedConfig ChartA11yPointFocus ChartA11yPointProps ChartA11yProps ChartA11ySeriesConfig
		ChartA11ySeriesProps ChartA11ySvgProps ChartA11yValue ChartType NormalizedChartA11yData
		NormalizedChartA11ySeries
	`),
	'a11y/react': words(`
		ChartA11yAnnouncer ChartA11yDataTable DEFAULT_CHART_A11Y_ID_PREFIX
		DEFAULT_POINT_DESCRIPTION_THRESHOLD DEFAULT_SINGLE_SERIES_LABEL generateChartDescription
		generateDataTableHTML getChartAriaProps normalizeChartA11yData useChartA11y useChartKeyboardNav
		A11yLocale ChartA11yAccessor ChartA11yAnnouncerProps ChartA11yConfig ChartA11yDataTableProps
		ChartA11yFlatConfig ChartA11yFocusedPoint ChartA11yFormatter ChartA11yIds ChartA11yKeyboardIntent
		ChartA11yKeyboardState ChartA11yLivePoliteness ChartA11yMode ChartA11yNestedConfig
		ChartA11yPointFocus ChartA11yPointProps ChartA11yProps ChartA11ySeriesConfig ChartA11ySeriesProps
		ChartA11ySvgProps ChartA11yValue ChartType NormalizedChartA11yData NormalizedChartA11ySeries
		UseChartA11yAnnouncerProps UseChartA11yDataTableProps UseChartA11yPointProps UseChartA11yResult
		UseChartA11ySvgProps UseChartKeyboardNavConfig UseChartKeyboardNavPointProps
		UseChartKeyboardNavResult UseChartKeyboardNavSvgProps
	`),
	'a11y/server': words(`
		DEFAULT_CHART_A11Y_ID_PREFIX DEFAULT_POINT_DESCRIPTION_THRESHOLD DEFAULT_SINGLE_SERIES_LABEL
		generateChartDescription generateDataTableHTML getChartAriaProps normalizeChartA11yData
		A11yLocale ChartA11yAccessor ChartA11yConfig ChartA11yFlatConfig ChartA11yFocusedPoint
		ChartA11yFormatter ChartA11yIds ChartA11yNestedConfig ChartA11yPointProps ChartA11yProps
		ChartA11ySeriesConfig ChartA11ySeriesProps ChartA11ySvgProps ChartA11yValue ChartType
		NormalizedChartA11yData NormalizedChartA11ySeries
	`),
	'axis/react': words(`useAxis UseAxisOptions`),
	chart: words(`
		getAxisTickCount getChartConfigColor getChartConfigEntry getChartConfigIcon getChartConfigLabel
		getChartCssVariableName getChartCssVariables getPaddedDomain getPositiveDomain getResponsiveWidth
		getVisibleTickValues getZeroBaselineDomain isFiniteNumber useChartDimensions AxisTickFormatter
		AxisTickValue ChartConfig ChartConfigItem ChartDimensions ChartTheme GetAxisTickCountOptions
		GetVisibleTickValuesOptions MarginShape NumericDomain RequiredMarginShape UseChartDimensionsOptions
	`),
	kernel: words(`
		createPath formatNumber normalizeAccessor setWarnHandler toPath2D useDomain useLatestRef
		useStableCallback useStableId useStructuralMemo Accessor AccessorInput AccessorKey BandDomain
		DomainForType DomainType FormatNumberOptions KernelWarning LinearDomain PathBuilder
		StructuralMemoDepth TimeDomain UseDomainOptions WarnCode WarnDetails WarnHandler
	`),
	'scale/react': words(`useScale`),
	'shape/react': words(`usePie PieArcDatum UsePieOptions UsePieResult`),
	theme: words(`
		ThemeScope createRuntimeTheme createThemeStyle cssVar darkTheme defineTheme fromXYChartTheme
		lightTheme CSSVarName CSSVarStyle CategoricalColorScale ChartConfig ChartSeriesConfig
		ThemeOverrides ThemeScopeElement ThemeScopeProps VisxThemeDefinition VisxThemeInput VisxThemeMode
		VisxThemeRuntime XYChartThemeLike
	`),
	'theme/react': words(`
		ThemeProvider useAxisStyle useCategoricalScale useChartConfig useColor useColorScale useGridStyle
		useTheme AxisOrientation AxisStyleProps AxisTextAnchor AxisTextStyleProps AxisVerticalAnchor
		CategoricalColorAccessor ChartConfig ChartSeriesConfig ColorScaleAccessor ColorTokenName
		GridStyleProps ResolvedSeries ThemeProviderProps UseChartConfigOptions UseChartConfigResult
		UseColorScaleOptions
	`),
	'tooltip/floating': words(`
		ChartTooltip ChartTooltipContent FloatingTooltip buildFloatingTooltipMiddleware
		getTooltipAnchorReference useChartTooltip useFloatingTooltip ChartTooltipConfig
		ChartTooltipContentProps ChartTooltipControlledProps ChartTooltipIndicator ChartTooltipItem
		ChartTooltipItemRenderParams ChartTooltipLabelRenderParams ChartTooltipLocalPoint ChartTooltipProps
		ChartTooltipSvgPoint ChartTooltipValueRenderParams FloatingTooltipArrowOptions
		FloatingTooltipArrowProps FloatingTooltipArrowState FloatingTooltipBoundary
		FloatingTooltipContentProps FloatingTooltipContentState FloatingTooltipFlipOptions
		FloatingTooltipHideOptions FloatingTooltipInteractions FloatingTooltipOffset
		FloatingTooltipOpenChangeDetails FloatingTooltipPadding FloatingTooltipPortalProps
		FloatingTooltipPositionerProps FloatingTooltipPositionerState FloatingTooltipProviderProps
		FloatingTooltipRootProps FloatingTooltipRootState FloatingTooltipShiftOptions
		FloatingTooltipSizeOptions FloatingTooltipTriggerProps FloatingTooltipTriggerState TooltipAlign
		TooltipAnchor TooltipCoordinateSpace TooltipPlacement TooltipSide TooltipVirtualElement
		UseChartTooltipOptions UseChartTooltipReturn UseFloatingTooltipOptions UseFloatingTooltipReturn
	`),
	'voronoi/react': words(`useVoronoi UseVoronoiOptions`),
};

const releasedEntries = ['chord', 'delaunay', 'react-spring', 'sankey', 'stats'];

// TypeScript 7 resolves a module specifier written in a program file, so a
// virtual module beside the parity tests imports every entry point under test.
// It reaches TypeScript through the API's file system callbacks, never the disk.
const specifiers = [
	'@octanejs/visx',
	'@visx/visx',
	...releasedEntries.flatMap((entry) => [`@octanejs/visx/${entry}`, `@visx/${entry}`]),
	...Object.keys(currentMasterEntries).map((entry) => `@octanejs/visx/${entry}`),
];
const importer = resolve(dirname(containingFile), `.public-types-${process.pid}.ts`);
const importerText = specifiers
	.map((specifier, index) => `import * as entry${index} from ${JSON.stringify(specifier)};`)
	.join('\n');
const api = new API({
	cwd: packageRoot,
	fs: {
		readFile: (fileName) => (fileName === importer ? importerText : undefined),
		fileExists: (fileName) => (fileName === importer ? true : undefined),
	},
});

try {
	const config = api.readConfigFile(configPath);
	if (config.error) throw new Error(config.error.text);
	const parsed = api.parseJsonConfigFileContent(config.config, { configDirectory: packageRoot });
	const program = api.createProgram([...parsed.fileNames, importer], parsed.options);
	const { checker } = program.getProject();
	const moduleSpecifiers = new Map(
		program
			.getSourceFile(importer)
			.statements.map((statement) => [statement.moduleSpecifier.text, statement.moduleSpecifier]),
	);

	function moduleSymbol(specifier) {
		const resolved = program.getResolvedModuleFromModuleSpecifier(
			moduleSpecifiers.get(specifier),
			importer,
		);
		assert.ok(resolved, `Unable to resolve ${specifier}`);
		const sourceFile = program.getSourceFile(resolved.resolvedFileName);
		assert.ok(sourceFile, `TypeScript program omitted ${specifier}`);
		const symbol = checker.getSymbolOfSourceFile(resolved.resolvedFileName);
		assert.ok(symbol, `TypeScript module has no symbol: ${specifier}`);
		return symbol;
	}

	function dereference(symbol) {
		return symbol.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
	}

	function exportNames(symbol) {
		return checker
			.getExportsOfModule(dereference(symbol))
			.map((entry) => entry.name)
			.sort();
	}

	function namespaceSymbol(module, namespace) {
		const symbol = checker.getExportsOfModule(module).find((entry) => entry.name === namespace);
		assert.ok(symbol, `Missing namespace ${namespace}`);
		return symbol;
	}

	const localRoot = moduleSymbol('@octanejs/visx');
	const upstreamRoot = moduleSymbol('@visx/visx');

	for (const namespace of stableNamespaces) {
		const local = exportNames(namespaceSymbol(localRoot, namespace));
		const upstream = exportNames(namespaceSymbol(upstreamRoot, namespace));
		assert.deepEqual(
			local,
			[...upstream, ...(currentAdditionsToStableNamespaces[namespace] ?? [])].sort(),
			`${namespace} public TypeScript exports differ from Visx 4.0.0 + current master`,
		);
	}

	for (const entry of releasedEntries) {
		assert.deepEqual(
			exportNames(moduleSymbol(`@octanejs/visx/${entry}`)),
			exportNames(moduleSymbol(`@visx/${entry}`)),
			`${entry} public TypeScript exports differ from Visx 4.0.0`,
		);
	}

	for (const [entry, expected] of Object.entries(currentMasterEntries)) {
		assert.deepEqual(
			exportNames(moduleSymbol(`@octanejs/visx/${entry}`)),
			expected,
			`${entry} public TypeScript exports differ from current Visx master`,
		);
	}

	console.log(
		`Visx public TypeScript surface matches ${stableNamespaces.length + 5} released and ${Object.keys(currentMasterEntries).length} current entry points.`,
	);
} finally {
	api.close();
}
