import { createRoot, delegateEvents } from 'octane';
import { Group, Panel, Separator, useDefaultLayout } from '@octanejs/resizable-panels';

delegateEvents(['blur', 'focus', 'keydown', 'pointerdown', 'pointermove', 'pointerup']);

function PersistedGroup() @{
	const persistence = useDefaultLayout({
		id: 'browser',
		panelIds: ['left', 'right'],
		debounceSaveMs: 0,
	});
	const { defaultLayout, ...callbacks } = persistence;
	return <Group
		{...callbacks}
		defaultLayout={defaultLayout ?? { left: 40, right: 60 }}
		className="group"
		id="primary"
	>
		<Panel className="panel" id="left" minSize="10%">left</Panel>
		<Separator className="separator" id="primary-separator" />
		<Panel className="panel" id="right" minSize="10%">right</Panel>
	</Group>;
}

function App() @{
	return <main data-ready="true">
		<div className="row">
			<PersistedGroup />
		</div>
		<div className="row">
			<Group className="group" id="sibling">
				<Panel className="panel" id="sibling-left">sibling left</Panel>
				<Separator className="separator" id="sibling-separator" />
				<Panel className="panel" id="sibling-right">sibling right</Panel>
			</Group>
		</div>
	</main>;
}

const root = document.querySelector('#root');
if (!(root instanceof HTMLElement)) throw new Error('Missing root');
createRoot(root).render(App);
