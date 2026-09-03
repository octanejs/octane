// RFC tsrx-org/RFCs#1 problem 4 under amendment A1: a block written inside an
// assigned element styles that element's other children (and below), never
// the element itself, and the component rendering the template carries
// nothing from it. Raw CSS in <style> is TSRX template syntax, so an assigned
// template with a block must be written inside a `@{ … }` body (at module
// scope it is a `tsrx-style-standalone-outside-template` error).
export function Templates() @{
	const card = <div id="er-card" class="er-card">
		<style>
			.er-card-text {
				color: rgb(21, 22, 23);
			}
			p {
				margin: 0;
			}
		</style>
		<p id="er-card-text" class="er-card-text">{'card'}</p>
	</div>;
	const chip = <span id="er-chip" class="er-chip">
		<style>
			.er-chip-text {
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

// A block beside the host in the output fragment is the fragment-children
// scope: it reaches the host, the assigned template written inside it, and
// everything below. The template's own block is a nested scope over its
// children only.
export function Enclosed() @{
	<>
		<style>
			.en-host {
				color: rgb(51, 52, 53);
			}
		</style>
		<div id="en-host" class="en-host">
			{<section id="en-inner" class="en-inner">
				<style>
					.en-inner-text {
						font-weight: 700;
					}
				</style>
				<b id="en-inner-text" class="en-inner-text">{'inner'}</b>
			</section>}
		</div>
	</>
}
