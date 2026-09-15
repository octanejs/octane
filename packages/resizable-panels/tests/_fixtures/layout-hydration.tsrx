import { Group, Panel, Separator, useDefaultLayout, type Layout } from '@octanejs/resizable-panels';

export function LayoutHydrationFixture({ initialLayout }: { initialLayout: Layout }) @{
	const persistence = useDefaultLayout({
		id: 'browser-layout',
		onlySaveAfterUserInteractions: true,
		debounceSaveMs: 0,
		storage: {
			getItem: () => JSON.stringify(initialLayout),
			setItem: (_key, value) => {
				document.cookie = `rrp-layout=${encodeURIComponent(value)}; Path=/; SameSite=Lax`;
			},
		},
	});
	return <Group {...persistence} id="layout-group" className="group">
		<Panel id="layout-left" defaultSize={`${initialLayout['layout-left']}%`}>left</Panel>
		<Separator id="layout-separator" className="separator" />
		<Panel id="layout-right" defaultSize={`${initialLayout['layout-right']}%`}>right</Panel>
	</Group>;
}
