import { activate } from './adapter.tsrx';

export function start() {
	const root = document.querySelector('#binding')!;
	const container = document.querySelector('#metrics')!;
	const status = root.querySelector('#status')!.textContent!;
	const controller = new AbortController();
	let tick = 0;
	let clicks = 0;
	let subscriptions = 0;
	let publish: (() => void) | undefined;
	const onClick = () => clicks++;
	const source = {
		getSnapshot: () => ({ status, tick: String(tick), onClick }),
		subscribe(notify: () => void) {
			subscriptions++;
			publish = notify;
			return () => {
				subscriptions--;
				publish = undefined;
			};
		},
	};
	const handle = activate(root, source, controller.signal);
	return {
		tick() {
			tick++;
			publish?.();
		},
		state() {
			return {
				containerConnected: container.isConnected,
				sameContainer: container === document.querySelector('#metrics'),
				connected: root.isConnected,
				sameRoot: root === document.querySelector('#binding'),
				ownedStatus: root.querySelector('#status')?.textContent,
				ownedTick: root.querySelector('#tick')?.textContent,
				currentStatus: document.querySelector('#binding #status')?.textContent,
				currentTick: document.querySelector('#binding #tick')?.textContent,
				clicks,
				subscriptions,
			};
		},
		clickOwned() {
			root.querySelector('button')!.click();
		},
		dispose() {
			controller.abort();
			handle.dispose();
		},
	};
}
