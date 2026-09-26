import { LiveCounter } from './LiveCounter.tsrx';

export function UnsafeShell() @{
	if (typeof window !== 'undefined') {
		const state = window as Window & { __unsafeShellRuns?: number };
		state.__unsafeShellRuns = (state.__unsafeShellRuns ?? 0) + 1;
	}
	<main>
		<div data-shell-slot>
			<LiveCounter />
		</div>
	</main>
}
