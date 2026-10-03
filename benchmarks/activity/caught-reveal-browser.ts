import {
	CaughtRevealModel,
	type CaughtRevealProps,
	type CaughtRevealRenderer,
} from './caught-reveal-model';
import { ensure } from './model';

type Operation = 'control' | 'reports';
// One independent root: its own container, model, and renderer.
type Copy = {
	container: HTMLElement;
	model: CaughtRevealModel;
	renderer: CaughtRevealRenderer;
	props: CaughtRevealProps;
	output: HTMLOutputElement;
};
type Session = {
	operation: Operation;
	copies: Copy[];
};

const TIMEOUT_MS = 10_000;

// A session holds `copies` independent roots, each revealing the same indices,
// so one timed run reveals them all and lifts a fast reveal well above the
// clock's 100 µs resolution. Every copy is verified on its own.
export function installCaughtRevealBenchmark(
	target: HTMLElement,
	createRenderer: (model: CaughtRevealModel, container: HTMLElement) => CaughtRevealRenderer,
): void {
	let current: Session | null = null;

	function sessionFor(): Session {
		ensure(current !== null, 'Caught reveal benchmark has not been prepared');
		return current;
	}

	function output(copy: Copy): HTMLOutputElement | null {
		return copy.container.querySelector<HTMLOutputElement>('[data-caught-reveal]');
	}

	function copyReady(copy: Copy, visible: boolean): boolean {
		const node = output(copy);
		return (
			node === copy.output &&
			node.textContent === '.'.repeat(copy.model.count) &&
			getComputedStyle(node).display === (visible ? 'inline' : 'none')
		);
	}

	function ready(session: Session, visible: boolean): boolean {
		return session.copies.every((copy) => copyReady(copy, visible));
	}

	function waitUntilReady(session: Session, visible: boolean): Promise<void> {
		if (ready(session, visible)) return Promise.resolve();
		return new Promise((resolve, reject) => {
			let finished = false;
			const observer = new MutationObserver(check);
			let timeout: ReturnType<typeof setTimeout>;
			function dispose() {
				observer.disconnect();
				clearTimeout(timeout);
			}
			function check() {
				if (finished || !ready(session, visible)) return;
				finished = true;
				dispose();
				resolve();
			}
			observer.observe(target, {
				attributes: true,
				attributeFilter: ['style'],
				characterData: true,
				childList: true,
				subtree: true,
			});
			timeout = setTimeout(() => {
				if (finished) return;
				finished = true;
				dispose();
				const count = session.copies[0]?.model.count ?? 0;
				reject(
					new Error(
						`Timed out waiting for ${session.operation}/${count}×${session.copies.length} visible=${visible}`,
					),
				);
			}, TIMEOUT_MS);
			check();
		});
	}

	function render(copy: Copy, next: Partial<CaughtRevealProps>): void {
		copy.props = { ...copy.props, ...next };
		copy.renderer.render(copy.props);
	}

	async function cleanup(): Promise<void> {
		if (current === null) return;
		for (const copy of current.copies) {
			copy.renderer.unmount();
			ensure(copy.container.childNodes.length === 0, 'Caught reveal root retained DOM');
			copy.container.remove();
		}
		ensure(target.childNodes.length === 0, 'Caught reveal target retained DOM');
		current = null;
	}

	async function prepare(
		indices: readonly number[],
		operation: Operation,
		copyCount = 1,
	): Promise<void> {
		ensure(operation === 'control' || operation === 'reports', `Unknown ${operation}`);
		ensure(Number.isSafeInteger(copyCount) && copyCount >= 1, `Bad copy count ${copyCount}`);
		await cleanup();
		const copies: Copy[] = [];
		const session: Session = { operation, copies };
		current = session;
		for (let index = 0; index < copyCount; index++) {
			const container = document.createElement('div');
			target.append(container);
			const model = new CaughtRevealModel(indices.length);
			const renderer = createRenderer(model, container);
			const props: CaughtRevealProps = {
				indices,
				errors: operation === 'reports' ? model.errors : null,
				mode: 'hidden',
			};
			renderer.render(props);
			const node = container.querySelector<HTMLOutputElement>('[data-caught-reveal]');
			ensure(node !== null, 'Caught reveal fixture did not mount its output');
			copies.push({ container, model, renderer, props, output: node });
		}
		await waitUntilReady(session, false);
		for (const copy of copies) copy.model.assertReports(0);
	}

	function run(): number {
		const session = sessionFor();
		const started = performance.now();
		for (const copy of session.copies) render(copy, { mode: 'visible' });
		return performance.now() - started;
	}

	function verify() {
		const session = sessionFor();
		const [first] = session.copies;
		const reports = session.operation === 'reports' ? first.model.count : 0;
		ensure(ready(session, true), 'Caught reveal did not commit synchronously');
		for (const copy of session.copies) copy.model.assertReports(reports);
		return {
			operation: session.operation,
			count: first.model.count,
			copies: session.copies.length,
			reports,
			checksum: first.model.checksum,
			outputRetained: session.copies.every((copy) => output(copy) === copy.output),
		};
	}

	async function gate(indices: readonly number[], operation: Operation) {
		await prepare(indices, operation);
		run();
		const snapshot = verify();
		await cleanup();
		return snapshot;
	}

	Object.assign(window, {
		__caughtRevealBench: { prepare, run, verify, cleanup, gate },
		__ready: true,
	});
}
