// Compatibility names retained from the earlier Octane Base UI binding. Each
// name points at a concrete declaration in the pinned upstream release;
// this mapping does not waive declaration precision or upstream coverage.
const baseUIAliases = new Map();
for (const [entry, namespace] of [
	['alert-dialog', 'AlertDialog'],
	['dialog', 'Dialog'],
	['menu', 'Menu'],
	['popover', 'Popover'],
	['preview-card', 'PreviewCard'],
	['tooltip', 'Tooltip'],
]) {
	baseUIAliases.set(`${namespace}Handle`, { entry, path: `${namespace}.Handle` });
	baseUIAliases.set(`create${namespace}Handle`, { entry, path: `${namespace}.createHandle` });
}
for (const [name, path] of [
	['TabsValue', 'Tabs.Tab.Value'],
	['TabsActivationDirection', 'Tabs.Tab.ActivationDirection'],
	['TabsOrientation', 'Tabs.Root.Orientation'],
])
	baseUIAliases.set(name, { entry: 'tabs', path });
baseUIAliases.set('useMediaQuery', {
	entry: 'unstable-use-media-query',
	path: 'useMediaQuery',
	// The original Octane API also accepts a query without an options object.
	additionalArity: 1,
});

// This type was exposed by the original Octane utility barrels. Jotai still
// publishes its declaration alongside useHydrateAtoms, although its barrels do
// not re-export it. The witness must pass the same npm-byte authentication.
const jotaiHydrationWitness = '@octanejs/jotai#hydration-types';
export function publicCompatibilityDeclarations(binding) {
	// motion's root re-exports framer-motion/dom. Keep the React hook declarations
	// as separate witnesses for the functions implemented by the native binding.
	if (binding === '@octanejs/motion')
		return new Map([
			['@octanejs/motion', 'dist/dom.d.ts'],
			['@octanejs/motion#react-types', 'dist/index.d.ts'],
		]);

	if (binding === '@octanejs/tanstack-router')
		return new Map([
			['@octanejs/tanstack-router#blocker-types', 'dist/esm/useBlocker.d.ts'],
			['@octanejs/tanstack-router#serializer-types', 'dist/esm/ssr/serializer.d.ts'],
		]);

	if (binding === '@octanejs/jotai')
		return new Map([[jotaiHydrationWitness, 'dist/react/utils/useHydrateAtoms.d.ts']]);
	if (binding === '@octanejs/tanstack-query')
		return new Map([
			['@octanejs/tanstack-query#error-reset-types', 'build/modern/QueryErrorResetBoundary.d.ts'],
		]);
	return new Map();
}

export function publicCompatibilityExport(specifier, name) {
	if (
		specifier === '@octanejs/motion' &&
		[
			'MotionConfigProps',
			'useAnimate',
			'useMotionValue',
			'useMotionValueEvent',
			'useReducedMotion',
			'useScroll',
			'useSpring',
			'useTransform',
		].includes(name)
	)
		return { specifier: specifier + '#react-types', path: name };

	// Motion's existing native host factories, compiled components, feature
	// bundles and contexts use Octane's calling convention. Authenticate their
	// retained contracts against the complete pre-update source receipt.
	if (
		specifier === '@octanejs/motion' &&
		[
			'motion',
			'm',
			'AnimatePresence',
			'LayoutGroup',
			'MotionConfig',
			'LazyMotion',
			'domAnimation',
			'domMax',
			'LayoutGroupProps',
			'LazyMotionProps',
			'LayoutGroupContext',
			'LazyMotionContext',
			'MotionConfigContext',
			'VariantContext',
			'StaggerContext',
		].includes(name)
	)
		return { specifier: specifier + '#prior-binding', path: name };

	// Native SSR compiles an App component with router props in a separate graph.
	if (
		specifier === '@octanejs/tanstack-router/ssr/server' &&
		['renderRouterToString', 'renderRouterToStream'].includes(name)
	)
		return { specifier: specifier + '#prior-binding', path: name };
	if (specifier === '@octanejs/tanstack-router' && name === 'SerializerExtensions')
		return {
			specifier: specifier + '#serializer-types',
			path: name,
			augmentedModule: '@tanstack/router-core',
		};

	// These named native exports are public return/parameter shapes upstream.
	// Their declarations are local to the authenticated useBlocker module.
	if (
		specifier === '@octanejs/tanstack-router' &&
		['BlockerResolver', 'ShouldBlockFnArgs'].includes(name)
	)
		return { specifier: specifier + '#blocker-types', path: name, localDeclaration: true };

	// Retained native contracts: createRoute/NotFoundRoute keep the file-route,
	// SSR and handlers slots separate; useRouter accepts an explicit router;
	// component aliases carry Octane's compiled component calling convention.
	// Every prior declaration is authenticated against the campaign baseline.
	if (
		specifier === '@octanejs/tanstack-router' &&
		[
			'createRoute',
			'NotFoundRoute',
			'AnyRootRoute',
			'useRouter',
			'AsyncRouteComponent',
			'RouteComponent',
			'ErrorRouteComponent',
		].includes(name)
	)
		return { specifier: specifier + '#prior-binding', path: name };

	if (specifier === '@octanejs/tanstack-table') {
		const aliases = {
			OctaneTable: 'ReactTable',
			AppOctaneTable: 'AppReactTable',
			SubscribeComponent: 'Subscribe',
		};
		if (aliases[name]) return { specifier, path: aliases[name] };
		// The existing native component alias defaults its props to the same `any`
		// used in the pinned component-registry constraint. Derive the witness from
		// that public declaration instead of authorizing arbitrary opaque props.
		if (name === 'TableComponentType')
			return { specifier, path: 'CreateTableHookOptions', constraintIndex: 1 };
	}
	if (specifier === '@octanejs/tanstack-table/legacy' && name === 'LegacyOctaneTable')
		return { specifier, path: 'LegacyReactTable' };

	// The original binding exports this named shape; upstream still publishes it
	// in the declaration module that defines the public error-reset hook.
	if (specifier === '@octanejs/tanstack-query' && name === 'QueryErrorResetBoundaryValue')
		return { specifier: '@octanejs/tanstack-query#error-reset-types', path: name };
	if (
		name === 'INTERNAL_InferAtomTuples' &&
		['@octanejs/jotai/react/utils', '@octanejs/jotai/utils'].includes(specifier)
	)
		return { specifier: jotaiHydrationWitness, path: name };

	const alias = baseUIAliases.get(name);
	if (!alias) return undefined;
	const witnessSpecifier = `@octanejs/base-ui/${alias.entry}`;
	if (specifier !== '@octanejs/base-ui' && specifier !== witnessSpecifier) return undefined;
	return { specifier: witnessSpecifier, path: alias.path, additionalArity: alias.additionalArity };
}
