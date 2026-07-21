import { Children, Fragment, useCallback, useMemo } from 'octane';
import { Tabs, type TabDefinition } from './Tabs.tsrx';
import { createPersistedEnumStore } from './usePersistedEnumStore';
import {
	BUNDLERS,
	BUNDLER_LABELS,
	DEFAULT_BUNDLER,
	isBundler,
	type Bundler,
} from '~/utils/markdown/bundler';

const bundlerStore = createPersistedEnumStore<Bundler>({
	storageKey: 'bundler',
	values: BUNDLERS,
	defaultValue: DEFAULT_BUNDLER,
});

export type BundlerTabsProps = {
	tabs: Array<{ slug: string; name: string }>;
	panelContent?: Record<string, 'code-only' | 'mixed'>;
	children: any;
};

export function BundlerTabs({ tabs, panelContent, children }: BundlerTabsProps) {
	bundlerStore.useHydrate();

	const activeBundler = bundlerStore((s) => s.value);
	const setBundler = bundlerStore((s) => s.setValue);

	const childrenArray = Children.toArray(children);

	const panelsBySlug = useMemo(() => {
		const map = new Map<string, any>();
		tabs.forEach((tab, index) => {
			map.set(tab.slug, childrenArray[index]);
		});
		return map;
	}, [tabs, childrenArray]);

	const tabDefinitions = useMemo<Array<TabDefinition>>(
		() => tabs.filter((tab) => isBundler(tab.slug)).map(
			(tab) => ({
				slug: tab.slug,
				name: BUNDLER_LABELS[tab.slug as Bundler] ?? tab.name,
				headers: [],
			}),
		),
		[tabs],
	);

	const orderedChildren = useMemo(() => tabDefinitions.map((tab) => panelsBySlug.get(tab.slug)), [
		tabDefinitions,
		panelsBySlug,
	]);

	const resolvedActiveSlug = tabDefinitions.some((tab) => tab.slug === activeBundler)
		? activeBundler
		: tabDefinitions[0]?.slug ?? activeBundler;

	const handleTabChange = useCallback((slug: string) => {
		if (isBundler(slug)) {
			setBundler(slug);
		}
	}, [setBundler]);

	if (tabDefinitions.length === 0) return null;

	return <Tabs
		tabs={tabDefinitions}
		activeSlug={resolvedActiveSlug}
		onTabChange={handleTabChange}
		panelContent={panelContent}
	>{orderedChildren.map(
		(child, index) => <Fragment key={tabDefinitions[index]?.slug ?? index}>{child}</Fragment>,
	)}</Tabs>;
}
