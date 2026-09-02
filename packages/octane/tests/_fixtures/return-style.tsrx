// React-style returned JSX uses the same component-scoped CSS contract as an
// `@{}` body. Splitting rules across two style blocks must still produce one
// canonical scope hash on every element and selector.
export function ReturnedScopedMailbox(props: { active: boolean; title: string }) {
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

// An assigned template rendered from returned JSX is a scope of its own; the
// returned tree is another. Elements inside the assigned template carry only
// its hash, elements of the returned tree only the returned scope's, and a
// nested `@{}` in the returned tree carries both of its enclosing hashes.
export function ReturnedNestedScopes(props: { label: string }) {
	const badge = <em id="returned-badge" class="badge">
		<style>
			.badge {
				color: rgb(70, 80, 90);
			}
		</style>
		{props.label as string}
	</em>;
	return <section id="returned-nested" class="outer">
		<style>
			.outer {
				color: rgb(1, 2, 3);
			}
		</style>
		<p id="returned-note" class="note">{'note'}</p>
		{badge}
		<div id="returned-inner-host">@{
			<>
				<style>
					.inner {
						font-weight: 700;
					}
				</style>
				<b id="returned-inner" class="inner">{'inner'}</b>
			</>
		}</div>
		<style>
			.note {
				letter-spacing: 1px;
			}
		</style>
	</section>;
}
