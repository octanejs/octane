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
	return binding === '@octanejs/jotai'
		? new Map([[jotaiHydrationWitness, 'dist/react/utils/useHydrateAtoms.d.ts']])
		: new Map();
}

export function publicCompatibilityExport(specifier, name) {
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
