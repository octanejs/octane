import { ViewTransition } from 'octane';

export function UnusedOwnedComponent() @{
	<>
		<button class="unused-owned-component" onAuxClick={() => {}}>{'unused'}</button>
		<ViewTransition>
			<aside>{'unused transition'}</aside>
		</ViewTransition>
		<style>
			.unused-owned-component {
				color: rgb(255, 0, 0);
			}
		</style>
	</>
}

export function RetainedOwnedComponent(props: { onClick: () => void }) @{
	<>
		<button
			id="minimal-owned-action"
			class="retained-owned-component"
			onClick={props.onClick}
		>{'retained'}</button>
		<style>
			.retained-owned-component {
				color: rgb(0, 0, 255);
			}
		</style>
	</>
}
