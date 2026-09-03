import { theme } from './style-order-theme.tsrx';

// The RFC opening example's shape: apply an imported theme, own one scope
// (purple), and nest a second scope (bold) in an `@{}` block. The applying
// block and the outer div are fragment siblings, so the div, its children, and
// the nested scope all carry the outer hash and then `theme.$class`; the
// nested block adds its own hash below it.
export function Applier() @{
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

// A second component applying the SAME theme: the theme's sheet belongs to the
// theme module, so sharing it never re-injects it.
export function SecondApplier() @{
	<>
		<style apply={theme} />
		<p class="second">
			<span class={theme.dark}>also dark</span>
		</p>
	</>
}
