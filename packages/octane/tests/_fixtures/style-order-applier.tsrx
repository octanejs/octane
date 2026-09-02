import { theme } from './style-order-theme.tsrx';

// The RFC opening example's shape: apply an imported theme, own one scope
// (purple), and nest a second scope (bold) in an `@{}` block. Every element
// carries its enclosing scope hashes outer → inner and then `theme.$class`.
export function Applier() @{
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

// A second component applying the SAME theme: the theme's sheet belongs to the
// theme module, so sharing it never re-injects it.
export function SecondApplier() @{
	<p class="second">
		<style apply={theme} />
		<span class={theme.dark}>also dark</span>
	</p>
}
