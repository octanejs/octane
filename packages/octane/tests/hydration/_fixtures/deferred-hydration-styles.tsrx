import { Hydrate } from 'octane';

function StyledReviews() @{
	<p id="styled-split-review">Deferred review</p>
}

// A scoped <style> AFTER a split boundary: the client extraction rewrite and
// the server fallback-strip rewrite both shift the tag's source position by
// different amounts, so the position-derived scope hash must be restamped from
// authored coordinates on both sides or hydration rebuilds the whole section.
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
