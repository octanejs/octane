import {
	CaughtRevealModel,
	type CaughtRevealProps,
	type CaughtRevealRenderer,
} from './caught-reveal-model';
import { ensure } from './model';

type Operation = 'control' | 'reports';
type Session = {
	operation: Operation;
	model: CaughtRevealModel;
	renderer: CaughtRevealRenderer;
	props: CaughtRevealProps;
	output: HTMLOutputElement;
};

const TIMEOUT_MS = 10_000;

export function installCaughtRevealBenchmark(
	target: HTMLElement,
	createRenderer: (model: CaughtRevealModel) => CaughtRevealRenderer,
): void {
	let current: Session | null = null;

	function sessionFor(): Session {
		ensure(current !== null, 'Caught reveal benchmark has not been prepared');
		return current;
	}

	function output(): HTMLOutputElement | null {
		return target.querySelector<HTMLOutputElement>('[data-caught-reveal]');
	}

	function ready(session: Session, visible: boolean): boolean {
		const node = output();
		return (
			node === session.output &&
			node.textContent === '.'.repeat(session.model.count) &&
			getComputedStyle(node).display === (visible ? 'inline' : 'none')
		);
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
				reject(
					new Error(
						`Timed out waiting for ${session.operation}/${session.model.count} visible=${visible}`,
					),
				);
			}, TIMEOUT_MS);
			check();
		});
	}

	function render(session: Session, next: Partial<CaughtRevealProps>): void {
		session.props = { ...session.props, ...next };
		session.renderer.render(session.props);
	}

	async function cleanup(): Promise<void> {
		if (current === null) return;
		current.renderer.unmount();
		ensure(target.childNodes.length === 0, 'Caught reveal root retained DOM');
		current = null;
	}

	async function prepare(indices: readonly number[], operation: Operation): Promise<void> {
		ensure(operation === 'control' || operation === 'reports', `Unknown ${operation}`);
		await cleanup();
		const model = new CaughtRevealModel(indices.length);
		const renderer = createRenderer(model);
		const props: CaughtRevealProps = {
			indices,
			errors: operation === 'reports' ? model.errors : null,
			mode: 'hidden',
		};
		renderer.render(props);
		const node = output();
		ensure(node !== null, 'Caught reveal fixture did not mount its output');
		const session: Session = { operation, model, renderer, props, output: node };
		current = session;
		await waitUntilReady(session, false);
		model.assertReports(0);
	}

	function run(): number {
		const session = sessionFor();
		const started = performance.now();
		render(session, { mode: 'visible' });
		return performance.now() - started;
	}

	function verify() {
		const session = sessionFor();
		const reports = session.operation === 'reports' ? session.model.count : 0;
		ensure(ready(session, true), 'Caught reveal did not commit synchronously');
		session.model.assertReports(reports);
		return {
			operation: session.operation,
			count: session.model.count,
			reports,
			checksum: session.model.checksum,
			outputRetained: output() === session.output,
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
