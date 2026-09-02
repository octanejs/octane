import { theme } from './theme.tsrx';

// panel.tsrx — applies the theme, owns a purple scope, nests a bold scope.
export function Panel() @{
	<div class="outer">
		<style apply={theme}>
			div {
				color: purple;
			}
		</style>
		<span class={theme.dark}>dark</span>
		@{
			<style>
				div {
					font-weight: bold;
				}
			</style>
			<div class="inner">inner</div>
		}
	</div>
}
