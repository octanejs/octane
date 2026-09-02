// RFC tsrx-org/RFCs#1 problem 4: a native element assigned to a variable is a
// scope of its own — at module scope and inside a component body alike. Its
// sheet injects at the declaration position and only its own subtree carries
// its hash; the component rendering it does not.
const card = <div id="er-card" class="er-card">
	<style>
		.er-card {
			color: rgb(21, 22, 23);
		}
		p {
			margin: 0;
		}
	</style>
	<p id="er-card-text" class="er-card-text">{'card'}</p>
</div>;

export function Templates() @{
	const chip = <span id="er-chip" class="er-chip">
		<style>
			.er-chip {
				color: rgb(31, 32, 33);
			}
		</style>
		<b id="er-chip-text" class="er-chip-text">{'chip'}</b>
	</span>;
	<>
		{card}
		{chip}
		<p id="er-outside" class="er-outside">{'outside'}</p>
	</>
}

// The component's own scope encloses an assigned template only when the
// template is written inside it.
export function Enclosed() @{
	<div id="en-host" class="en-host">
		<style>
			.en-host {
				color: rgb(51, 52, 53);
			}
		</style>
		{<section id="en-inner" class="en-inner">
			<style>
				.en-inner {
					font-weight: 700;
				}
			</style>
			<b id="en-inner-text" class="en-inner-text">{'inner'}</b>
		</section>}
	</div>
}
