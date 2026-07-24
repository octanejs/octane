// The tab shell hosting the Components (P1), Profiler (P2), and Transitions
// (P3) tabs. This is the plugin's top-level render() node — see ../index.ts.
import { useState } from 'octane';
import type { OctaneNode } from 'octane';
import { OctaneDevtoolsEventClient } from '../client';
import { ComponentsTab } from './ComponentsTab.tsrx';
import { ProfilerTab } from './ProfilerTab.tsrx';
import { TransitionsTab } from './TransitionsTab.tsrx';

type Tab = 'components' | 'profiler' | 'transitions';

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
		</div>
		<div style={{ flex: '1', overflow: 'auto' }}>
			@if (tab === 'components') {
				<ComponentsTab client={client} />
			} @else if (tab === 'profiler') {
				<ProfilerTab client={client} />
			} @else {
				<TransitionsTab client={client} />
			}
		</div>
	</div>;
}
