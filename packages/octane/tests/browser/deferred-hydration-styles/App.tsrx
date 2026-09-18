import { Hydrate } from 'octane';
import type { HydrationStrategy } from 'octane/hydration';

export interface StyledHydrationProps {
	when: HydrationStrategy;
	onHydrated?(): void;
	onClick?(): void;
}

export function App(props: StyledHydrationProps) @{
	<main>
		<p class="deferred-style-note" data-outside>Outside the style scope</p>
		<Hydrate when={props.when} onHydrated={props.onHydrated}>
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
				<button class="deferred-style-note" onClick={props.onClick}>
					<span>Styled deferred widget</span>
				</button>
			</section>
		</Hydrate>
	</main>
}
