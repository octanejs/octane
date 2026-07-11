import { ViewTransition } from 'octane';

// Fixtures for ../view-transition.test.ts (Phase 2 feature coverage:
// addTransitionType + per-type class maps, 'none' deactivation, share
// viewport decay, callback cleanups).

// update class is a per-type map: the 'nav-forward' type picks 'slide-left'.
export function TypedUpdateApp(props) @{
	<ViewTransition
		update={{ 'nav-forward': 'slide-left', default: 'auto' }}
		onUpdate={props.onUpdate}
	>
		<div>
			{props.text as string}
		</div>
	</ViewTransition>
}

// The 'instant' type resolves 'none' (deactivates); the default is 'auto'.
export function NoneMapApp(props) @{
	<ViewTransition update={{ instant: 'none', default: 'auto' }} onUpdate={props.onUpdate}>
		<div>
			{props.text as string}
		</div>
	</ViewTransition>
}

// Named pair for the share viewport-decay test.
export function NamedShareApp(props) @{
	<>
		@if (props.page === 'a') {
			<ViewTransition name="decay-hero" onShare={props.onShareA} onExit={props.onExitA}>
				<div>{'Page A'}</div>
			</ViewTransition>
		} @else {
			<ViewTransition name="decay-hero" onEnter={props.onEnterB}>
				<div>{'Page B'}</div>
			</ViewTransition>
		}
	</>
}

// Cleanup-before-next-fire coverage.
export function CleanupApp(props) @{
	<ViewTransition onUpdate={props.onUpdate}>
		<div>
			{props.text as string}
		</div>
	</ViewTransition>
}
