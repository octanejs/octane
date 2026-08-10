import { useRef, useState } from 'octane';
import { useGSAP } from '@octanejs/gsap';

type RuntimeKey = 'octane' | 'react';

type LifecycleBucket = {
	octane: string[];
	react: string[];
};

/**
 * Side-channel log that survives root teardown. The differential rig removes
 * both containers on `unmount()`, so cleanup must not rely on DOM state.
 * Entries are keyed by the nearest `data-rt` ancestor the shared rig sets.
 */
function lifecycleBucket(): LifecycleBucket {
	const globalObject = globalThis as
		typeof globalThis & {
			__octaneGsapLifecycle?: LifecycleBucket;
		};
	if (globalObject.__octaneGsapLifecycle == null) {
		globalObject.__octaneGsapLifecycle = { octane: [], react: [] };
	}
	return globalObject.__octaneGsapLifecycle;
}

function runtimeKey(node: HTMLElement | null): RuntimeKey | null {
	let current: HTMLElement | null = node;
	while (current != null) {
		const value = current.getAttribute('data-rt');
		if (value === 'octane' || value === 'react') {
			return value;
		}
		current = current.parentElement;
	}
	return null;
}

function recordLifecycle(scopeEl: HTMLElement | null, entry: string): void {
	const key = runtimeKey(scopeEl);
	if (key == null) {
		return;
	}
	lifecycleBucket()[key].push(entry);
}

export function resetGsapLifecycleLog(): void {
	const bucket = lifecycleBucket();
	bucket.octane = [];
	bucket.react = [];
}

export function readGsapLifecycleLog(): { octane: string[]; react: string[] } {
	const bucket = lifecycleBucket();
	return {
		octane: bucket.octane.slice(),
		react: bucket.react.slice(),
	};
}

/**
 * Exposes the useGSAP effect/cleanup sequence in the DOM so the differential
 * rig can prove @octanejs/gsap and @gsap/react deliver the same lifecycle.
 * Click `#bump` to advance the dependency the effect watches.
 *
 * Cleanup is also recorded to a teardown-surviving side channel so unmount
 * parity can be asserted after both roots are gone.
 */
export function GSAPLifecycleDiff(props: { revertOnUpdate?: boolean }) @{
	const scope = useRef<HTMLDivElement>(null);
	const [value, setValue] = useState('one');
	const [log, setLog] = useState('');
	useGSAP(function lifecycle(context, contextSafe) {
		// Capture while mounted; refs may already be cleared when cleanup runs.
		const mountedKey = runtimeKey(scope.current);
		const count = context.selector?.('.target').length ?? 0;
		recordLifecycle(scope.current, `effect:${value}:${String(count)}`);
		setLog(function appendEffect(previous) {
			const next = `effect:${value}:${String(count)}`;
			return previous === '' ? next : `${previous}|${next}`;
		});
		const safeMark = contextSafe(function markSafe() {
			recordLifecycle(scope.current, `safe:${value}`);
			setLog(function appendSafe(previous) {
				const next = `safe:${value}`;
				return previous === '' ? next : `${previous}|${next}`;
			});
		});
		safeMark();
		return function cleanup() {
			if (mountedKey != null) {
				lifecycleBucket()[mountedKey].push(`cleanup:${value}`);
			}
			setLog(function appendCleanup(previous) {
				const next = `cleanup:${value}`;
				return previous === '' ? next : `${previous}|${next}`;
			});
		};
	}, {
		scope,
		dependencies: [value],
		revertOnUpdate: props.revertOnUpdate,
	});

	function bump() {
		setValue(function nextValue(previous) {
			return previous === 'one' ? 'two' : 'three';
		});
	}

	<div ref={scope} class="probe">
		<button id="bump" type="button" onClick={bump}>
			bump
		</button>
		<span class="target">{value as string}</span>
		<pre class="log">{log as string}</pre>
	</div>
}
