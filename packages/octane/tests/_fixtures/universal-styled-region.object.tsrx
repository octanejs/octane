import { Html } from '/packages/octane/tests/_fixtures/universal-renderer-boundaries.object.tsrx';

// The DOM region embeds these parsed children, including a scoped stylesheet
// whose nodes carry CSS offsets rather than JavaScript locations.
export function StyledReverseScene(props) @{
	<Html>
		<section class="overlay">{props.label as string}</section>
		<style>
			.overlay {
				color: red;
			}
		</style>
	</Html>
}
