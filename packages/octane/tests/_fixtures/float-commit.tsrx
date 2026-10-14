// Fixtures for float-commit.test.ts: every Float resource and resource hint a
// render requests reaches document.head at that render's commit (#2043).
import { preinit, preinitModule, preload, use } from 'octane';

function Probe(props: { probe: () => void }) @{
	props.probe();
	<u>{'probe'}</u>
}

function Gate(props: { gate: PromiseLike<unknown> }) @{
	use(props.gate);
	<i>{'gate'}</i>
}

// Hint identity outlives resetFloatResourceState, so each test names its own.
function Resources(props: { hints: string }) @{
	preload('/' + props.hints + '-hero.png', { as: 'image' });
	preinit('/commit-init.css', { as: 'style', precedence: 'init' });
	preinitModule('/' + props.hints + '-module.mjs');
	<>
		<link rel="stylesheet" href="/commit-app.css" precedence="app" />
		<style href="commit-inline" precedence="app">
			.commit {
				color: teal;
			}
		</style>
		<script async src="/commit-async.js" />
		<b>{'resources'}</b>
	</>
}

export interface FloatCommitProps {
	hints: string;
	show: boolean;
	gate?: PromiseLike<unknown>;
	probe: () => void;
}

// The resources render before the probe, so the probe sees what their
// requests wrote while the render is still open, and the gate suspends the
// root only after both.
export function FloatCommitApp(props: FloatCommitProps) @{
	<main>
		@if (props.show) {
			<Resources hints={props.hints} />
		}
		<Probe probe={props.probe} />
		@if (props.gate !== undefined) {
			<Gate gate={props.gate} />
		}
	</main>
}

// An option the platform rejects as an attribute name is skipped: the commit
// that inserts the sheet must not throw past the rest of its writes.
export function RejectedOptionName() @{
	preinit('/commit-rejected.css', { as: 'style', 'not a name': 'x', media: 'print' });
	<p>{'committed'}</p>
}
