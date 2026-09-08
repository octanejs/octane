import { createElement } from 'react';
import { createRoot as createReactRoot } from 'react-dom/client';
import ReactWaypoint from 'react-waypoint';
import { createRoot as createOctaneRoot, flushSync } from 'octane';
import OctaneWaypoint, { type WaypointCallbackArgs } from '../../src/index.ts';

type Runtime = 'octane' | 'react';
type Entry = { callback: string; currentPosition: string; previousPosition?: string };
const logs: Record<Runtime, Entry[]> = { octane: [], react: [] };

function callbacks(runtime: Runtime) {
	const record = (callback: string) => (args: WaypointCallbackArgs) => {
		logs[runtime].push({
			callback,
			currentPosition: args.currentPosition,
			previousPosition: args.previousPosition,
		});
	};
	return {
		onEnter: record('enter'),
		onLeave: record('leave'),
		onPositionChange: record('position'),
	};
}

const octaneRoot = createOctaneRoot(document.querySelector('#octane-root')!);
octaneRoot.render(OctaneWaypoint, callbacks('octane'));
flushSync(() => {});

const reactRoot = createReactRoot(document.querySelector('#react-root')!);
reactRoot.render(createElement(ReactWaypoint, callbacks('react')));

let top = 20;
let bottom = 40;
function rect(): DOMRect {
	return {
		top,
		bottom,
		left: 0,
		right: 10,
		width: 10,
		height: bottom - top,
		x: 0,
		y: top,
		toJSON: () => ({}),
	} as DOMRect;
}

window.__waypointParity = {
	prepare() {
		for (const span of document.querySelectorAll('span')) span.getBoundingClientRect = rect;
		logs.octane.length = 0;
		logs.react.length = 0;
	},
	move(nextTop, nextBottom) {
		top = nextTop;
		bottom = nextBottom;
		window.dispatchEvent(new Event('scroll'));
	},
	reset() {
		logs.octane.length = 0;
		logs.react.length = 0;
	},
	state(runtime) {
		return logs[runtime].map((entry) => ({ ...entry }));
	},
	benchmark() {
		const start = performance.now();
		for (let index = 0; index < 500; index += 1) {
			top = index % 2 === 0 ? 20 : 120;
			bottom = top + 20;
			window.dispatchEvent(new Event('scroll'));
		}
		return performance.now() - start;
	},
};

declare global {
	interface Window {
		__waypointParity: {
			benchmark(): number;
			move(top: number, bottom: number): void;
			prepare(): void;
			reset(): void;
			state(runtime: Runtime): Entry[];
		};
	}
}
