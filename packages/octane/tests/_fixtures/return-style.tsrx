// Raw CSS in <style> is TSRX template syntax (RFC tsrx-org/RFCs#1, amendment
// A1, rule B): a plain function that returns JSX may carry a standalone block
// only inside a TSRX container — an @if/@for/@switch/@try body or a nested
// `@{ … }` — where it is a child of that body's output fragment and styles the
// other children beside it and everything below them. The returned tree
// around the container carries no hash of its own.
export function ReturnedBranchScopes(props: { active: boolean; title: string }) {
	return <section id="returned-branches" class="mailbox">
		<h2 id="returned-title" class="mailbox-title">{props.title as string}</h2>
		@if (props.active) {
			<>
				<style>
					.status {
						color: rgb(10, 20, 30);
					}
				</style>
				<p id="returned-status" class="status">Active mailbox</p>
			</>
		} @else {
			<>
				<style>
					.status {
						color: rgb(40, 50, 60);
					}
				</style>
				<p id="returned-status" class="status">Idle mailbox</p>
			</>
		}
	</section>;
}

// A nested `@{ … }` inside returned JSX is a container too: a block among its
// output fragment's children styles the siblings beside it and below, and
// nothing outside the fragment.
export function ReturnedNestedScopes(props: { label: string }) {
	return <section id="returned-nested" class="outer">
		<p id="returned-note" class="note">{'note'}</p>
		<div id="returned-inner-host">@{
			<>
				<style>
					.inner {
						font-weight: 700;
					}
				</style>
				<b id="returned-inner" class="inner">{props.label as string}</b>
			</>
		}</div>
	</section>;
}
