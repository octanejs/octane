export const callout = <style>
	.card {
		border-top-color: #d93025;
	}
</style>;

export function App() @{
	<section class="board">
		<style apply={callout}>
			.card {
				border: 1px solid #3c4043;
				border-top-color: #d93025;
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
