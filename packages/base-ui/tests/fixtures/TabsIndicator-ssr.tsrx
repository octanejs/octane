import * as React from 'octane';
import { Tabs } from '@octanejs/base-ui/tabs';
import { CSPProvider } from '@octanejs/base-ui/csp-provider';

export function TabsIndicatorServerCase1() {
	return <Tabs.Root value={1}>
		<Tabs.List>
			<Tabs.Tab value={1}>One</Tabs.Tab>
			<Tabs.Indicator renderBeforeHydration />
		</Tabs.List>
	</Tabs.Root>;
}

export function TabsIndicatorServerCase2() {
	return <CSPProvider nonce="test-nonce">
		<Tabs.Root value={1}>
			<Tabs.List>
				<Tabs.Tab value={1}>One</Tabs.Tab>
				<Tabs.Indicator renderBeforeHydration />
			</Tabs.List>
		</Tabs.Root>
	</CSPProvider>;
}
