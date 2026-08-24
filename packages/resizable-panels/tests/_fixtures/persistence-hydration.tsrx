import { useDefaultLayout, type LayoutStorage } from '@octanejs/resizable-panels';

export function PersistenceHydrationFixture({ storage }: { storage?: LayoutStorage }) @{
	const persistence = useDefaultLayout({ id: 'hydrated', storage });
	const layout = persistence.defaultLayout;
	return <button
		data-layout={layout ? JSON.stringify(layout) : 'default'}
		onClick={() => persistence.onLayoutChanged({ left: 30, right: 70 }, {
			isUserInteraction: true,
		})}
	>save</button>;
}
