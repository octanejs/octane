import { useState } from 'octane';

export function App() @{
	const [expanded, setExpanded] = useState(false);

	<>
		<style>
			.panel {
				border: 1px solid gray;
			}
			.title {
				font-weight: bold;
			}
		</style>
		<section id="panel" class="panel">
			<h1 id="title" class="title">Build status</h1>
			<button id="toggle" type="button" onClick={() => setExpanded(!expanded)}>
				Toggle details
			</button>
			@{
				<>
					<style>
						.summary {
							color: gray;
						}
					</style>
					<p id="summary" class="summary title">All checks passed</p>
				</>
			}
			@if (expanded) {
				<>
					<style>
						.details {
							color: green;
						}
					</style>
					<p id="details" class="details">12 checks, 0 failures</p>
				</>
			}
		</section>
	</>
}
