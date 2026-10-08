import { memo, useActionState, useLayoutEffect } from 'octane';

// Fixture for browser/action-backlog (#1864). One form queues several submissions
// behind a gate; a separate click opens it, so every queued action becomes ready
// in the microtask checkpoint of that click. The result view is memoized and
// deliberately slow, so each extra result commit costs measurable input latency.

export type ActionBacklogProps = {
	gate: Promise<void>;
	busyMs: number;
	release(): void;
	onCommit(state: number, pending: boolean): void;
	onResult(value: number): void;
};

type SlowResultProps = {
	value: number;
	busyMs: number;
	onResult(value: number): void;
};

const SlowResult = memo(function SlowResult(props: SlowResultProps) @{
	props.onResult(props.value);
	const start = performance.now();
	while (performance.now() - start < props.busyMs) {
		// Stand-in for an expensive result view.
	}
	<output data-result>{String(props.value)}</output>
});

export function ActionBacklog(props: ActionBacklogProps) @{
	const [saved, submit, isPending] = useActionState(async (previous: number) => {
		await props.gate;
		return previous + 1;
	}, 0);
	useLayoutEffect(() => {
		props.onCommit(saved, isPending);
	}, null);
	<section>
		<form action={submit}>
			<button data-submit type="submit">
				Save
			</button>
		</form>
		<button data-release type="button" onClick={() => props.release()}>
			Release
		</button>
		<output data-pending>{isPending ? 'pending' : 'idle'}</output>
		<SlowResult value={saved} busyMs={props.busyMs} onResult={props.onResult} />
	</section>
}
