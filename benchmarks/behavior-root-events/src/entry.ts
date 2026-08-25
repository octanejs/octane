import { attachBehaviorRoot } from 'octane/behavior';

function deferred<T>(): {
	promise: Promise<T>;
	resolve: (value: T | PromiseLike<T>) => void;
} {
	let resolve!: (value: T | PromiseLike<T>) => void;
	const promise = new Promise<T>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}

export interface BehaviorResumeBatch {
	prepare(): Promise<void>;
	resume(): Promise<{ handled: number; fifo: boolean; checksum: number }>;
	dispose(): void;
}

export function createBehaviorResumeBatch(count: number): BehaviorResumeBatch {
	const container = document.createElement('section');
	const fragment = document.createDocumentFragment();
	const buttons: HTMLButtonElement[] = [];
	for (let index = 0; index < count; index++) {
		const button = document.createElement('button');
		button.dataset.benchmarkIndex = String(index);
		fragment.appendChild(button);
		buttons.push(button);
	}
	container.appendChild(fragment);
	document.body.appendChild(container);

	const events = buttons.map(
		(_, index) => new CustomEvent<number>('probe', { bubbles: true, detail: index }),
	);
	const moduleReady = deferred<void>();
	const prepared = deferred<void>();
	const adoptionReadiness = Array.from({ length: count }, () => deferred<void>());
	let adopted = 0;
	let handled = 0;
	let fifo = true;
	let checksum = 0;
	const root = attachBehaviorRoot(container);
	const behavior = root.registerBehavior({
		target: '[data-benchmark-index]',
		events: ['probe'],
		ready: moduleReady.promise,
		adopt(element) {
			const index = Number((element as HTMLElement).dataset.benchmarkIndex);
			adopted++;
			if (adopted === count) prepared.resolve(undefined);
			return adoptionReadiness[index].promise;
		},
		handleEvent(event, element) {
			const index = (event as CustomEvent<number>).detail;
			if (index !== handled || event !== events[index] || element !== buttons[index]) fifo = false;
			handled++;
			checksum += index;
		},
	});

	for (let index = 0; index < count; index++) {
		buttons[index].dispatchEvent(events[index]);
	}

	return {
		async prepare() {
			moduleReady.resolve(undefined);
			await prepared.promise;
			if (handled !== 0) throw new Error('Queued events ran before their adoptions settled');
		},
		async resume() {
			for (const readiness of adoptionReadiness) {
				readiness.resolve(undefined);
				await Promise.resolve();
			}
			await behavior.ready;
			return { handled, fifo, checksum };
		},
		dispose() {
			behavior.dispose();
			root.dispose();
			container.remove();
		},
	};
}
