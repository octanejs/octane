import * as React from 'react';
import { createRoot as createReactRoot, type Root as ReactRoot } from 'react-dom/client';
import { createRoot as createOctaneRoot } from 'octane';
import { Counter, type Observation } from './counter.js';
import { Shell } from './shell.tsrx';

type Lane = 'direct-react-roots' | 'react-compat';

function check(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

export async function sample(lane: Lane, count: number) {
	const indices = Array.from({ length: count }, (_, index) => index);
	const container = document.createElement('div');
	document.body.append(container);
	const waiters = new Set<() => void>();
	let notificationQueued = false;
	const observation: Observation = {
		layout: new Map(),
		refs: new Map(),
		passive: new Set(),
		setups: 0,
		cleanups: 0,
		refSetups: 0,
		refCleanups: 0,
		changed() {
			if (notificationQueued) return;
			notificationQueued = true;
			queueMicrotask(() => {
				notificationQueued = false;
				for (const wake of waiters) wake();
			});
		},
	};
	const mutations = new MutationObserver(() => observation.changed());
	mutations.observe(container, { subtree: true, childList: true, characterData: true });
	function until(predicate: () => boolean): Promise<void> {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				waiters.delete(wake);
				reject(new Error(`Timed out: ${lane}/${count}; ${container.innerHTML.slice(0, 300)}`));
			}, 10_000);
			function wake() {
				if (!predicate()) return;
				clearTimeout(timeout);
				waiters.delete(wake);
				resolve();
			}
			waiters.add(wake);
			wake();
		});
	}
	function ready(label: string, value: number) {
		return (
			observation.refs.size === count &&
			observation.passive.size === count &&
			indices.every(
				(index) =>
					observation.layout.get(index) === `${label}:${value}` &&
					observation.refs.get(index)?.textContent === `${label}:${value}`,
			)
		);
	}
	let render: (label: string) => void;
	let unmount: () => void;
	const timings: Record<string, number> = {};
	const started = performance.now();
	if (lane === 'react-compat') {
		const root = createOctaneRoot(container);
		render = (label) => root.render(Shell, { indices, label, observation });
		unmount = () => root.unmount();
	} else {
		const main = document.createElement('main');
		container.append(main);
		const roots: ReactRoot[] = [];
		for (const index of indices) {
			const host = document.createElement('div');
			host.setAttribute('data-react-compat', '');
			main.append(host);
			roots[index] = createReactRoot(host);
		}
		render = (label) => {
			for (const index of indices)
				roots[index].render(React.createElement(Counter, { index, label, observation }));
		};
		unmount = () => {
			for (const root of roots) root.unmount();
			main.remove();
		};
	}
	try {
		render('before');
		await until(() => ready('before', 0));
		timings.mount = performance.now() - started;
		check(container.querySelectorAll('[data-react-compat]').length === count, 'host count');
		check(container.querySelectorAll('button').length === count, 'counter count');
		check(container.querySelectorAll('*').length === 1 + count * 2, 'element topology');
		const buttons = indices.map((index) => observation.refs.get(index)!);
		const markup = container.innerHTML.replace(/<!--.*?-->/g, '');
		let phase = performance.now();
		for (const button of buttons) button.click();
		await until(() => ready('before', 1));
		timings.local_update = performance.now() - phase;
		phase = performance.now();
		render('after');
		await until(() => ready('after', 1));
		timings.parent_update = performance.now() - phase;
		check(
			indices.every((index) => observation.refs.get(index) === buttons[index]),
			'DOM identity',
		);
		check(
			observation.setups === count && observation.refSetups === count,
			'stateful child remounted',
		);
		phase = performance.now();
		unmount();
		await until(
			() =>
				container.childNodes.length === 0 &&
				observation.passive.size === 0 &&
				observation.refs.size === 0,
		);
		timings.unmount = performance.now() - phase;
		check(observation.cleanups === count && observation.refCleanups === count, 'unmount cleanup');
		return {
			timings,
			semantic: {
				count,
				markup,
				setups: observation.setups,
				cleanups: observation.cleanups,
				refSetups: observation.refSetups,
				refCleanups: observation.refCleanups,
				statePreserved: true,
				identityPreserved: true,
			},
		};
	} finally {
		mutations.disconnect();
		container.remove();
	}
}
