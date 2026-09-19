export function OwnerButton(props: { invoke: () => void }) @{
	<button onClick={props.invoke}>read</button>
}

export function OwnerBubble(props: { remove: () => void; bubble: () => void }) @{
	<main onClick={props.bubble}>
		<button onClick={props.remove}>remove</button>
	</main>
}

export function HeldOwnerButton(props: { invoke: () => void; wait: () => void }) @{
	<section>
		@try {
			<div>
				<button onClick={props.invoke}>read</button>
				@{
					props.wait();
				}
			</div>
		} @pending {
			<p>pending</p>
		}
	</section>
}
