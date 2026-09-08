import { Group, Panel, Separator, useDefaultLayout } from '@octanejs/resizable-panels';

export function ReactResizablePanelsDemo() @{
	const persistence = useDefaultLayout({
		id: 'octane-playground',
		panelIds: ['navigation', 'content', 'details'],
	});

	<div>
		<h2 class="demo-title">{'React Resizable Panels on Octane'}</h2>
		<p
			class="demo-blurb"
		>{'Drag either separator, focus it and use the arrow keys, then reload to restore the layout.'}</p>
		<div class="panel" style={{ height: '22rem', padding: 0, overflow: 'hidden' }}>
			<Group
				id="playground-panels"
				defaultLayout={persistence.defaultLayout ??
					{
						navigation: 24,
						content: 52,
						details: 24,
					}}
				onLayoutChange={persistence.onLayoutChange}
				onLayoutChanged={persistence.onLayoutChanged}
			>
				<Panel id="navigation" minSize="12%" style={{ padding: '1rem' }}>
					<strong>{'Navigation'}</strong>
					<p>{'A compact project tree.'}</p>
				</Panel>
				<Separator
					aria-label="Resize navigation"
					style={{ width: '0.5rem', background: 'var(--border)' }}
				/>
				<Panel id="content" minSize="24%" style={{ padding: '1rem' }}>
					<strong>{'Editor'}</strong>
					<p>{'The flexible center panel preserves the remaining space.'}</p>
				</Panel>
				<Separator
					aria-label="Resize details"
					style={{ width: '0.5rem', background: 'var(--border)' }}
				/>
				<Panel id="details" minSize="12%" style={{ padding: '1rem' }}>
					<strong>{'Details'}</strong>
					<p>{'Persisted with useDefaultLayout.'}</p>
				</Panel>
			</Group>
		</div>
	</div>
}
