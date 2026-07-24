// The tab shell hosting the Components (P1) and Profiler (Task 3) tabs. This is
// the plugin's top-level render() node — see ../index.ts.
import { useState } from 'octane';
import type { OctaneNode } from 'octane';
import { OctaneDevtoolsEventClient } from '../client';
import { ComponentsTab } from './ComponentsTab.tsrx';
import { ProfilerTab } from './ProfilerTab.tsrx';

type Tab = 'components' | 'profiler';

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
		</div>
		<div style={{ flex: '1', overflow: 'auto' }}>
			@if (tab === 'components') {
				<ComponentsTab client={client} />
			} @else {
				<ProfilerTab client={client} />
			}
		</div>
	</div>;
}
