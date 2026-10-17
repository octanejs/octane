// Fixtures for style-hidden-commit.test.ts: an authored style update to a host
// that Activity or Suspense hides lands under the hide at commit (#2043).
import { Activity, Suspense, use } from 'octane';

function Probe(props: { probe: () => void }) @{
	props.probe();
	<u>{'probe'}</u>
}

function Gate(props: { gate: PromiseLike<unknown> }) @{
	use(props.gate);
	<i>{'gate'}</i>
}

export interface HiddenStyleProps {
	hidden: boolean;
	prefix: Record<string, unknown>;
	color: string;
	/** Suspends the Suspense primary while set. */
	pending?: PromiseLike<unknown>;
	/** Suspends the root, outside every boundary, while set. */
	gate?: PromiseLike<unknown>;
	probe: () => void;
}

// A spread style writes through the object style setter, the path a hidden
// host's authored style takes. Both hidden hosts render before the probe, and
// the gate suspends the root only after all three.
export function HiddenStyleApp(props: HiddenStyleProps) @{
	<main>
		<Activity mode={props.hidden ? 'hidden' : 'visible'}>
			<div id="activity" style={{ ...props.prefix, color: props.color }} />
		</Activity>
		<Suspense fallback={<p>{'pending'}</p>}>
			<div id="suspense" style={{ ...props.prefix, color: props.color }} />
			@if (props.pending !== undefined) {
				<Gate gate={props.pending} />
			}
		</Suspense>
		<Probe probe={props.probe} />
		@if (props.gate !== undefined) {
			<Gate gate={props.gate} />
		}
	</main>
}

// A hidden host's style value that fails to coerce fails at commit, and the
// nearest boundary catches it as it would a commit function's.
export function HiddenStyleErrorApp(props: { prefix: Record<string, unknown>; color: string }) @{
	<main>
		@try {
			<Activity mode="hidden">
				<div id="activity" style={{ ...props.prefix, color: props.color }} />
			</Activity>
		} @catch (error) {
			<p id="caught">{(error as Error).message}</p>
		}
	</main>
}
