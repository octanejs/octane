import { ViewTransition } from 'octane';

export function UnrelatedRootsApp(props: { text: string; onUpdate: () => void }) @{
	<ViewTransition update="grow" onUpdate={props.onUpdate}>
		<div id="changing">{props.text as string}</div>
	</ViewTransition>
}

export function UnrelatedSidebar(props: { onEnter: (instance: { name: string }) => void }) @{
	<ViewTransition default="none" enter="pop" onEnter={props.onEnter}>
		<span id="sidebar-label">{'sidebar'}</span>
	</ViewTransition>
}
