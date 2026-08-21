import {
	ASYNC_OPERATIONS,
	CYCLE_COUNT,
	ROW_COUNT,
	UPDATE_COUNT,
	assertOperation,
} from './contract.mjs';
import { Model, ensure, type AppProps, type Counts, type Renderer } from './model';

const increment = (value: number) => value + 1;
const DRAFT = 'retained draft';
const TIMEOUT_MS = 10_000;

type Session = {
	operation: string;
	model: Model;
	renderer: Renderer;
	props: AppProps;
	locals: number[];
	nodes: HTMLElement[] | null;
	draft: boolean;
};

type Timing = { commitMs: number; readyMs: number };

function isVisible(session: Session) {
	return (
		session.props.shape === 'plain' ||
		(session.props.mode === 'visible' &&
			(session.props.shape !== 'nested' || session.props.innerMode === 'visible'))
	);
}

function expectedCounts(operation: string): Counts {
	const mounts = operation === 'mount_visible' ? ROW_COUNT : 0;
	const cycles =
		operation === 'hide_reveal' || operation === 'nested_hide_reveal' ? ROW_COUNT * CYCLE_COUNT : 0;
	return {
		layoutMounts: mounts + cycles,
		layoutCleanups: cycles,
		passiveMounts: mounts + cycles,
		passiveCleanups: cycles,
	};
}

export function installBenchmark(target: HTMLElement, createRenderer: () => Renderer) {
	let current: Session | null = null;

	function sessionFor(operation?: string): Session {
		ensure(current !== null, 'Activity benchmark has not been prepared');
		if (operation !== undefined) {
			ensure(current.operation === operation, `Prepared ${current.operation}, not ${operation}`);
		}
		return current;
	}

	function rows() {
		return Array.from(target.querySelectorAll<HTMLElement>('[data-row]'));
	}

	function ready(session: Session): boolean {
		const visible = isVisible(session);
		const expectedActive = visible ? ROW_COUNT : 0;
		if (
			session.model.layoutActive.size !== expectedActive ||
			session.model.passiveActive.size !== expectedActive ||
			target.querySelector('[data-tick]')?.textContent !== String(session.props.tick)
		) {
			return false;
		}
		const elements = rows();
		if (elements.length !== ROW_COUNT) return false;
		for (let index = 0; index < elements.length; index++) {
			const element = elements[index];
			if (
				element.dataset.row !== String(index) ||
				element.dataset.generation !== String(session.props.generation) ||
				element.dataset.local !== String(session.locals[index]) ||
				element.style.display !== (visible ? 'inline-block' : 'none')
			) {
				return false;
			}
		}
		return true;
	}

	function waitUntilReady(session: Session): Promise<void> {
		if (ready(session)) return Promise.resolve();
		return new Promise((resolve, reject) => {
			let finished = false;
			let timeout: ReturnType<typeof setTimeout>;
			const observer = new MutationObserver(check);
			const unsubscribe = session.model.onChange(check);
			function dispose() {
				observer.disconnect();
				unsubscribe();
				clearTimeout(timeout);
			}
			function check() {
				if (finished || !ready(session)) return;
				finished = true;
				dispose();
				resolve();
			}
			observer.observe(target, {
				attributes: true,
				attributeFilter: ['data-generation', 'data-local', 'style'],
				childList: true,
				characterData: true,
				subtree: true,
			});
			timeout = setTimeout(() => {
				if (finished) return;
				finished = true;
				dispose();
				reject(
					new Error(
						`Timed out in ${session.operation}: rows=${rows().length}, ` +
							`layout=${session.model.layoutActive.size}, passive=${session.model.passiveActive.size}, ` +
							`generation=${session.props.generation}, visible=${isVisible(session)}`,
					),
				);
			}, TIMEOUT_MS);
			check();
		});
	}

	function render(session: Session, next: Partial<AppProps>) {
		session.props = { ...session.props, ...next };
		session.renderer.render(session.props);
	}

	function captureIdentity(session: Session) {
		if (session.nodes !== null) return;
		session.nodes = rows();
		ensure(session.nodes.length === ROW_COUNT, 'Cannot capture an incomplete Activity tree');
		const input = session.nodes[0].querySelector('input');
		ensure(input !== null, 'Missing uncontrolled input');
		input.value = DRAFT;
		session.draft = true;
	}

	function assertState(session: Session) {
		ensure(ready(session), `Incomplete ${session.operation} state`);
		const elements = rows();
		const visible = isVisible(session);
		for (let index = 0; index < elements.length; index++) {
			const element = elements[index];
			if (session.nodes !== null) {
				ensure(element === session.nodes[index], `Row ${index} lost its DOM identity`);
			}
			ensure(
				element.querySelector('button')?.textContent?.trim() ===
					`${index}:${session.props.generation}:${session.locals[index]}`,
				`Row ${index} has stale visible text`,
			);
			const input = element.querySelector('input');
			ensure(
				input?.value === (index === 0 && session.draft ? DRAFT : `row-${index}`),
				`Row ${index} lost its uncontrolled input value`,
			);
			ensure(
				getComputedStyle(element).display === (visible ? 'inline-block' : 'none'),
				`Row ${index} has incorrect computed visibility`,
			);
		}
	}

	async function cleanup() {
		if (current === null) return;
		const session = current;
		session.renderer.unmount();
		ensure(target.childNodes.length === 0, 'Activity root retained DOM after unmount');
		session.model.assertReleased();
		current = null;
	}

	async function prepare(operation: string) {
		assertOperation(operation);
		await cleanup();
		const model = new Model();
		const session: Session = {
			operation,
			model,
			renderer: createRenderer(),
			props: {
				model,
				shape:
					operation === 'plain_updates' || operation === 'plain_descendant_updates'
						? 'plain'
						: operation === 'nested_hide_reveal'
							? 'nested'
							: 'flat',
				mode: operation === 'mount_hidden' ? 'hidden' : 'visible',
				innerMode: 'visible',
				generation: 0,
				tick: 0,
			},
			locals: Array.from({ length: ROW_COUNT }, () => 0),
			nodes: null,
			draft: false,
		};
		current = session;
		if (operation === 'mount_visible' || operation === 'mount_hidden') return;

		session.renderer.render(session.props);
		await waitUntilReady(session);
		captureIdentity(session);
		// Seed real component state through its public native click handler. The
		// retained setter used by the hidden-descendant lane was obtained from a
		// real, connected layout effect, not from a render-body instrumentation hook.
		const button = session.nodes![0].querySelector('button');
		ensure(button !== null, 'Missing stateful button');
		session.locals[0]++;
		session.renderer.flush(() => button.click());
		await waitUntilReady(session);
		assertState(session);
		if (operation === 'hidden_burst' || operation === 'hidden_descendant_updates') {
			render(session, { mode: 'hidden' });
			await waitUntilReady(session);
			assertState(session);
		}
		model.resetSample();
	}

	async function run(operation: string, checkpoints = false): Promise<Timing> {
		const session = sessionFor(operation);
		if (operation === 'hidden_descendant_updates' || operation === 'plain_descendant_updates') {
			for (let index = 0; index < ROW_COUNT; index++) session.locals[index]++;
		}
		const started = performance.now();
		switch (operation) {
			case 'mount_visible':
			case 'mount_hidden':
				session.renderer.render(session.props);
				break;
			case 'hide_reveal':
				for (let cycle = 0; cycle < CYCLE_COUNT; cycle++) {
					render(session, { mode: 'hidden' });
					if (checkpoints) assertState(session);
					render(session, { mode: 'visible' });
					if (checkpoints) assertState(session);
				}
				break;
			case 'nested_hide_reveal':
				for (let cycle = 0; cycle < CYCLE_COUNT; cycle++) {
					render(session, { mode: 'hidden' });
					if (checkpoints) assertState(session);
					render(session, { innerMode: 'hidden' });
					if (checkpoints) assertState(session);
					render(session, { mode: 'visible' });
					if (checkpoints) assertState(session);
					render(session, { innerMode: 'visible' });
					if (checkpoints) assertState(session);
				}
				break;
			case 'visible_updates':
			case 'hidden_burst':
			case 'plain_updates':
				for (let generation = 1; generation <= UPDATE_COUNT; generation++) {
					render(session, { generation, tick: generation });
				}
				break;
			case 'hidden_descendant_updates':
			case 'plain_descendant_updates':
				session.renderer.flush(() => {
					for (const setter of session.model.setters) {
						ensure(setter !== null, 'A visible row did not publish its state setter');
						setter(increment);
					}
				});
				break;
			default:
				throw new Error(`Unknown operation: ${operation}`);
		}
		const commitMs = performance.now() - started;
		let readyMs = commitMs;
		if (!ready(session)) {
			await waitUntilReady(session);
			readyMs = performance.now() - started;
		}
		if (!ASYNC_OPERATIONS.has(operation)) {
			ensure(readyMs === commitMs, `${operation} did not complete in its sync commit`);
		}
		return { commitMs, readyMs };
	}

	function verify(operation: string) {
		const session = sessionFor(operation);
		captureIdentity(session);
		assertState(session);
		const expected = expectedCounts(operation);
		const actual = session.model.sample();
		for (const key of Object.keys(expected) as Array<keyof Counts>) {
			ensure(
				actual[key] === expected[key],
				`${operation}: ${key} ${actual[key]} != ${expected[key]}`,
			);
		}
		return {
			rows: ROW_COUNT,
			generation: session.props.generation,
			localChecksum: session.locals.reduce((sum, value, index) => sum + (index + 1) * value, 0),
			visible: isVisible(session),
			shellTick: session.props.tick,
			effects: actual,
			identitiesPreserved: true,
			draftRetained: true,
		};
	}

	async function confirm() {
		const session = sessionFor();
		if (!isVisible(session)) {
			const before = { ...session.model.total };
			render(session, { mode: 'visible', innerMode: 'visible' });
			await waitUntilReady(session);
			assertState(session);
			ensure(
				session.model.total.layoutMounts - before.layoutMounts === ROW_COUNT &&
					session.model.total.passiveMounts - before.passiveMounts === ROW_COUNT,
				'Revealing hidden work did not reconnect every effect exactly once',
			);
		}
		const button = session.nodes![0].querySelector('button');
		ensure(button !== null, 'Missing stateful button after reveal');
		session.locals[0]++;
		session.renderer.flush(() => button.click());
		await waitUntilReady(session);
		assertState(session);
	}

	async function gate(operation: string) {
		await prepare(operation);
		await run(operation, true);
		const snapshot = verify(operation);
		await confirm();
		await cleanup();
		return snapshot;
	}

	async function observeWork(operation: string) {
		const counts = { styleWrites: 0, stateAttributeWrites: 0, addedRows: 0, removedRows: 0 };
		const countRows = (node: Node) =>
			node instanceof Element
				? Number(node.matches('[data-row]')) + node.querySelectorAll('[data-row]').length
				: 0;
		function collect(records: MutationRecord[]) {
			for (const record of records) {
				if (record.type === 'attributes' && (record.target as Element).matches('[data-row]')) {
					if (record.attributeName === 'style') counts.styleWrites++;
					else counts.stateAttributeWrites++;
				} else if (record.type === 'childList') {
					for (const node of record.addedNodes) counts.addedRows += countRows(node);
					for (const node of record.removedNodes) counts.removedRows += countRows(node);
				}
			}
		}
		const observer = new MutationObserver(collect);
		observer.observe(target, {
			attributes: true,
			attributeFilter: ['style', 'data-generation', 'data-local'],
			childList: true,
			subtree: true,
		});
		try {
			await run(operation);
			collect(observer.takeRecords());
		} finally {
			observer.disconnect();
		}
		const snapshot = verify(operation);
		return { counts, snapshot };
	}

	const api = { prepare, run, verify, confirm, cleanup, gate, observeWork };
	Object.assign(window, {
		__activityBench: api,
		__activityPrepare: prepare,
		__activityRun: run,
		__activityVerify: verify,
		__activityConfirm: confirm,
		__activityCleanup: cleanup,
		__ready: true,
	});
}
