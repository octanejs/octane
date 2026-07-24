// The tab shell hosting the Components (P1), Profiler (P2), Transitions (P3),
// and Performance-model (P4) tabs. This is the plugin's top-level render()
// node — see ../index.ts.
import { useState } from 'octane';
import type { OctaneNode } from 'octane';
import { OctaneDevtoolsEventClient } from '../client';
import { ComponentsTab } from './ComponentsTab.tsrx';
import { ProfilerTab } from './ProfilerTab.tsrx';
import { TransitionsTab } from './TransitionsTab.tsrx';
import { PerfModelTab } from './PerfModelTab.tsrx';

type Tab = 'components' | 'profiler' | 'transitions' | 'performance';

export function OctanePanel(props: { client: OctaneDevtoolsEventClient }): OctaneNode {
	const { client } = props;
	const [tab, setTab] = useState<Tab>('components');

	return <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
		<div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid #ccc', padding: '4px' }}>
			<button
				onClick={() => setTab('components')}
				style={{ fontWeight: tab === 'components' ? 'bold' : 'normal' }}
			>
				Components
			</button>
			<button
				onClick={() => setTab('profiler')}
				style={{ fontWeight: tab === 'profiler' ? 'bold' : 'normal' }}
			>
				Profiler
			</button>
			<button
				onClick={() => setTab('transitions')}
				style={{ fontWeight: tab === 'transitions' ? 'bold' : 'normal' }}
			>
				Transitions
			</button>
			<button
				onClick={() => setTab('performance')}
				style={{ fontWeight: tab === 'performance' ? 'bold' : 'normal' }}
			>
				Performance
			</button>
		</div>
		<div style={{ flex: '1', overflow: 'auto' }}>
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
