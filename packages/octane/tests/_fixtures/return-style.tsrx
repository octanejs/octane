// React-style returned JSX uses the same component-scoped CSS contract as an
// `@{}` body. Splitting rules across two style blocks must still produce one
// canonical scope hash on every element and selector.
export function ReturnedScopedMailbox(props) {
	return <>
		<section id="returned-scoped-mailbox" class={['mailbox', { active: props.active }]}>
			<h2 class="mailbox-title">{props.title as string}</h2>
			<p class="mailbox-status">
				{props.active ? 'Active mailbox' : 'Idle mailbox'}
			</p>
		</section>
		<style>
			.mailbox {
				color: rgb(10, 20, 30);
			}
			.active {
				background-color: rgb(40, 50, 60);
			}
		</style>
		<>
			<style>
				.mailbox-title {
					font-weight: 700;
				}
				.mailbox-status {
					letter-spacing: 2px;
				}
			</style>
		</>
	</>;
}
