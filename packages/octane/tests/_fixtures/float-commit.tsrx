// Fixtures for float-commit.test.ts: React DOM's Float timing. A resource hint
// inserts when called, a stylesheet resource preloads as the render discovers
// it, and every resource element reaches document.head at its commit (#2043).
import { preinit, preinitModule, preload, use } from 'octane';

function Probe(props: { probe: () => void }) @{
	props.probe();
	<u>{'probe'}</u>
}

function Gate(props: { gate: PromiseLike<unknown> }) @{
	use(props.gate);
	<i>{'gate'}</i>
}

// Hint identity outlives resetFloatResourceState, so each case names its own
// resources with `id`.
function Resources(props: { id: string }) @{
	preload('/' + props.id + '-hero.png', { as: 'image' });
	preinit('/' + props.id + '-init.css', { as: 'style', precedence: 'init' });
	preinitModule('/' + props.id + '-module.mjs');
	<>
		<link
			rel="stylesheet"
			href={'/' + props.id + '-app.css'}
			precedence="app"
			crossOrigin="anonymous"
			media="all"
		/>
		<style href={props.id + '-inline'} precedence="app">
			.commit {
				color: teal;
			}
		</style>
		<script async src={'/' + props.id + '-async.js'} />
		<b>{'resources'}</b>
	</>
}

export interface FloatCommitProps {
	id: string;
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
			<Resources id={props.id} />
		}
		<Probe probe={props.probe} />
		@if (props.gate !== undefined) {
			<Gate gate={props.gate} />
		}
	</main>
}

function Exploding(props: { fail: boolean }) @{
	if (props.fail) throw new Error('arm failure');
	<span>{'arm'}</span>
}

function ArmSheet(props: { href: string; fail: boolean }) @{
	<>
		<link rel="stylesheet" href={props.href} precedence="arm" />
		<Exploding fail={props.fail} />
	</>
}

// An arm that requests a sheet and then fails never commits: like React's
// discarded fibers, it leaves its preload and none of its elements.
export function FailingArmApp(props: { href: string; fail: boolean }) @{
	<main>
		@try {
			<ArmSheet href={props.href} fail={props.fail} />
		} @catch (error) {
			<p>{(error as Error).message}</p>
		}
	</main>
}

// An option the platform rejects as an attribute name is skipped: the commit
// that inserts the sheet must not throw past the rest of its writes.
export function RejectedOptionName(props: { extra: Record<string, unknown> }) @{
	<>
		<link rel="stylesheet" href="/commit-rejected.css" precedence="default" {...props.extra} />
		<p>{'committed'}</p>
	</>
}
