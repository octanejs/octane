/** @jsxImportSource octane */

import { createRoot, flushSync, useState } from 'octane';

type StateSetter = (value: number | ((current: number) => number)) => void;

export interface SchedulerWave {
	run(): {
		checksum: number;
		connected: boolean;
		durationMs: number;
		leafIdentityRetained: boolean;
		queuedComponents: number;
		renderedComponents: number;
	};
	dispose(): void;
}

interface ChainProps {
	checksum: number;
	count: number;
	level: number;
	renders: number[];
	setters: StateSetter[];
}

function Chain({ checksum, count, level, renders, setters }: ChainProps) {
	const [value, setValue] = useState(0);
	setters[level] = setValue;
	renders[level] = (renders[level] ?? 0) + 1;
	const nextChecksum = checksum + value;
	return level + 1 === count ? (
		<output data-scheduler-depth-leaf="">{String(nextChecksum)}</output>
	) : (
		<Chain
			checksum={nextChecksum}
			count={count}
			level={level + 1}
			renders={renders}
			setters={setters}
		/>
	);
}

export function createSchedulerWave(count: number): SchedulerWave {
	if (!Number.isSafeInteger(count) || count < 2) {
		throw new TypeError(`Scheduler wave count must be an integer above one, received ${count}.`);
	}
	const container = document.createElement('main');
	document.body.appendChild(container);
	const renders: number[] = [];
	const setters: StateSetter[] = [];
	const root = createRoot(container);
	root.render(Chain, { checksum: 0, count, level: 0, renders, setters });
	const leaf = container.querySelector('[data-scheduler-depth-leaf]');
	if (leaf === null || setters.length !== count) {
		root.unmount();
		container.remove();
		throw new Error(`Scheduler wave mounted ${setters.length} of ${count} state owners.`);
	}
	let revision = 0;
	return {
		run() {
			const before = renders.slice();
			const started = performance.now();
			flushSync(() => {
				// Queue deepest-first so shallow-first ordering must do real work instead of
				// inheriting component-tree order from the setters.
				for (let index = setters.length - 1; index >= 0; index--) {
					setters[index]((current) => current + 1);
				}
			});
			const durationMs = performance.now() - started;
			revision++;
			let renderedComponents = 0;
			for (let index = 0; index < renders.length; index++) {
				renderedComponents += renders[index] - before[index];
			}
			return {
				checksum: Number(leaf.textContent),
				connected: container.isConnected,
				durationMs,
				leafIdentityRetained: container.querySelector('[data-scheduler-depth-leaf]') === leaf,
				queuedComponents: setters.length,
				renderedComponents,
			};
		},
		dispose() {
			root.unmount();
			container.remove();
		},
	};
}
