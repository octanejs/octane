import { Hydrate } from 'octane';
import { load } from 'octane/hydration';
import { choose, ready } from './deferred-hydration-style-actions.js';

export function StyledIndependentHydration() @{
	<main>
		<p class="deferred-style-note" data-outside>Outside the style scope</p>
		<Hydrate independent when={load()}>
			<section>
				<style>
					.deferred-style-note {
						color: rgb(20, 120, 80);
					}
					.deferred-style-note > span {
						font-weight: 700;
					}
				</style>
				<input aria-label="Draft" defaultValue="server" />
				<button class="deferred-style-note" onClick={choose} ref={ready}>
					<span>Styled independent widget</span>
				</button>
			</section>
		</Hydrate>
	</main>
}
