// The tab shell hosting the Components (P1), Profiler (P2), Transitions (P3),
// and Performance-model (P4) tabs. This is the plugin's top-level render()
// node — see ../index.ts. It injects the Octane-branded panel stylesheet once
// and asks the bridge for a fresh snapshot on mount so tabs populate immediately.
import { useEffect, useState } from 'octane';
import type { OctaneNode } from 'octane';
import { OctaneDevtoolsEventClient } from '../client';
import { ComponentsTab } from './ComponentsTab.tsrx';
import { ProfilerTab } from './ProfilerTab.tsrx';
import { TransitionsTab } from './TransitionsTab.tsrx';
import { PerfModelTab } from './PerfModelTab.tsrx';
import { OCTANE_DEVTOOLS_CSS, OCTANE_DEVTOOLS_STYLE_ID } from './styles';

type Tab = 'components' | 'profiler' | 'transitions' | 'performance';

const TABS: Array<{ id: Tab; label: string }> = [
	{ id: 'components', label: 'Components' },
	{ id: 'profiler', label: 'Profiler' },
	{ id: 'transitions', label: 'Transitions & Suspense' },
	{ id: 'performance', label: 'Performance' },
];

export function OctanePanel(props: { client: OctaneDevtoolsEventClient }): OctaneNode {
	const { client } = props;
	const [tab, setTab] = useState<Tab>('components');

	useEffect(() => {
		// The panel is portaled into the TanStack DevTools host, so site CSS never
		// reaches it — inject our own Octane-branded stylesheet once.
		if (typeof document !== 'undefined' && !document.getElementById(OCTANE_DEVTOOLS_STYLE_ID)) {
			const el = document.createElement('style');
			el.id = OCTANE_DEVTOOLS_STYLE_ID;
			el.textContent = OCTANE_DEVTOOLS_CSS;
			document.head.appendChild(el);
		}
		// Pull a current snapshot so tabs show data on open, not only after the
		// next scheduler flush.
		client.emit('refresh', {});
	});

	return <div class="odt-root">
		<div class="odt-tabs">
			@for (const t of TABS; key t.id) {
				<button
					class={['odt-tab', tab === t.id && 'odt-tab-active']}
					onClick={() => setTab(t.id)}
				>{t.label}</button>
			}
		</div>
		<div class="odt-body">
			@if (tab === 'components') {
				<ComponentsTab client={client} />
			} @else if (tab === 'profiler') {
				<ProfilerTab client={client} />
			} @else if (tab === 'transitions') {
				<TransitionsTab client={client} />
			} @else {
				<PerfModelTab client={client} />
			}
		</div>
	</div>;
}
