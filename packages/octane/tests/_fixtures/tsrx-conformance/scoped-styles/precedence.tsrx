// Ordering: applied theme, then the outer scope's blocks as one contiguous
// group (even though one sits after the nested scope), then the inner scope.
const theme = <style>
	.theme {
		--label: theme;
	}
	div {
		color: green;
	}
</style>;

export function Precedence() @{
	<>
		<style apply={theme}>
			.outer {
				--label: outer;
			}
			div {
				color: black;
			}
		</style>
		<div class="o1 outer">{'outer'}</div>
		@{
			<>
				<style>
					.inner {
						--label: inner;
					}
					div {
						color: blue;
					}
				</style>
				<div class="i1 inner">{'inner'}</div>
			</>
		}
		<style>
			.outer {
				--label: outer;
			}
			div {
				font-style: italic;
			}
		</style>
	</>
}
