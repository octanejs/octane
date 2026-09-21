export const callout = <style>
	.card {
		border-top-color: #d93025;
	}
</style>;

export function App() @{
	<section class="board">
		<style apply={callout}>
			.card {
				border-width: 1px;
				border-style: solid;
				border-right-color: #3c4043;
				border-bottom-color: #3c4043;
				border-left-color: #3c4043;
			}
			.card h2 {
				margin: 0;
			}
		</style>
		<article class="card">
			<h2>Usage</h2>
			<p>The merged shorthand resets the theme's top border.</p>
		</article>
	</section>
}
