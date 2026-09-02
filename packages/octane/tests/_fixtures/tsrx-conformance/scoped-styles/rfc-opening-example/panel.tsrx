// panel.tsrx — the component module of the RFC's opening example.
import { theme } from './theme.tsrx';

export function Panel() @{
	<>
		<style apply={theme}>
			/* scope A; also attaches theme.$class to the scope */
			.scopeA {
				--label: scopeA;
			}
			div {
				color: black;
			}
		</style>

		<span class={theme.dark}>Purple</span>
		<div class="d1 scopeA">Black system-ui: the local rule beats the theme's green</div>

		<style>
			/* still scope A, so the same hash */
			.scopeA {
				--label: scopeA;
			}
			p {
				margin: 0;
			}
		</style>
		<p class="p1">No margin</p>

		@{
			<>
				<style>
					/* scope B, nested inside A */
					.scopeB {
						--label: scopeB;
					}
					div {
						font-weight: bold;
					}
				</style>
				<div class="d2 scopeB">Black and bold: A and B both reach here</div>
				<p class="p2">No margin: A reaches here too</p>
			</>
		}
	</>
}
