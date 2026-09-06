import { Hydrate } from 'octane';

function StyledReviews() @{
	<p id="styled-split-review">Deferred review</p>
}

// A scoped <style> AFTER a split boundary: the client extraction rewrite and
// the server fallback-strip rewrite both shift the tag's source position by
// different amounts, so the position-derived scope hash must be restamped from
// authored coordinates on both sides or hydration rebuilds the whole section.
// The block is an item of the section's children list, so it stamps the note
// beside it (and the boundary's fallback), never the section that contains it.
export function StyledSplitHydration(props) @{
	<section id="styled-split-host">
		<Hydrate
			when={props.when}
			onHydrated={props.onHydrated}
			fallback={<p id="styled-split-fallback">Loading styled reviews</p>}
		>
			<StyledReviews />
		</Hydrate>
		<p class="styled-split-note">After the boundary</p>
		<style>
			.styled-split-note {
				color: rgb(255, 65, 90);
			}
		</style>
	</section>
}

// Plan S8.5: a complete lexical scope owned by the split child. The block and
// the hosts it stamps all sit inside the boundary, so the extracted child and
// the server compile share the authored-position hash.
export function StyledCompleteSplitHydration(props) @{
	<section id="styled-complete-split-host">
		<Hydrate when={props.when} onHydrated={props.onHydrated}>
			<div>
				<p class="styled-complete-note" id="styled-complete-note">
					Inside the boundary
				</p>
				<style>
					.styled-complete-note {
						color: rgb(20, 120, 80);
					}
				</style>
				<p id="styled-complete-review">Deferred complete-scope review</p>
			</div>
		</Hydrate>
	</section>
}
