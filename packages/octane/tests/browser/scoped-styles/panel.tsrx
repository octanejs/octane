import { theme } from './theme.tsrx';

// panel.tsrx — applies the theme, owns a purple scope, nests a bold scope. The
// applying block and the outer div are fragment siblings, so the div and
// everything below it carry the purple scope and the theme.
export function Panel() @{
	<>
		<style apply={theme}>
			div {
				color: purple;
			}
		</style>
		<div class="outer">
			<span class={theme.dark}>dark</span>
			@{
				<>
					<style>
						div {
							font-weight: bold;
						}
					</style>
					<div class="inner">inner</div>
				</>
			}
		</div>
	</>
}
