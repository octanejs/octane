import { CYCLE_COUNT, ROW_COUNT, UPDATE_COUNT } from './contract.mjs';
import { REF_DEPTH, REF_OPERATIONS } from './ref-contract.mjs';
import { ensure } from './model';
import { RefModel, type RefPrimer, type RefProps, type RefRenderer } from './ref-model';

type Operation = 'ref_replacements' | 'deep_ref_replacements' | 'ref_mount_unmount';
type Session = {
	operation: Operation;
	model: RefModel;
	renderer: RefRenderer;
	props: RefProps;
	nodes: HTMLButtonElement[] | null;
};

export function installRefBenchmark(
	target: HTMLElement,
	createRenderer: () => RefRenderer,
	primeActivity: RefPrimer,
) {
	let current: Session | null = null;
	let primed = false;
	let primer: { container: HTMLElement; release: () => void } | null = null;

	function sessionFor(operation?: Operation): Session {
		ensure(current !== null, 'Ref control has not been prepared');
		if (operation !== undefined) {
			ensure(current.operation === operation, `Prepared ${current.operation}, not ${operation}`);
		}
		return current;
	}

	function rows() {
		return Array.from(target.querySelectorAll<HTMLButtonElement>('[data-ref-row]'));
	}

	function assertPrimerHidden() {
		if (primer === null) return;
		const child = primer.container.querySelector('span');
		ensure(
			child !== null && child.isConnected && getComputedStyle(child).display === 'none',
			'The unrelated Activity did not remain mounted and hidden',
		);
	}

	function assertState(session: Session) {
		assertPrimerHidden();
		const elements = rows();
		const count = session.props.present ? ROW_COUNT : 0;
		ensure(elements.length === count, `Ref control row count ${elements.length} != ${count}`);
		ensure(
			session.model.active.size === count,
			`Ref control retained ${session.model.active.size} refs`,
		);
		for (let index = 0; index < elements.length; index++) {
			const element = elements[index];
			const active = session.model.active.get(index);
			ensure(element.dataset.refRow === String(index), `Ref row ${index} was reordered`);
			ensure(
				element.dataset.variant === String(session.props.variant),
				`Ref row ${index} is stale`,
			);
			ensure(
				element.textContent?.trim() === `${index}:${session.props.variant}`,
				`Ref row ${index} has stale text`,
			);
			ensure(
				active?.element === element && active.variant === session.props.variant,
				`Ref ${index} does not point at its current live element`,
			);
			if (session.nodes !== null) {
				ensure(element === session.nodes[index], `Ref replacement remounted row ${index}`);
			}
		}
	}

	function render(session: Session, next: Partial<RefProps>) {
		session.props = { ...session.props, ...next };
		session.renderer.render(session.props);
	}

	function cleanup() {
		if (current === null) return;
		current.renderer.unmount();
		ensure(target.childNodes.length === 0, 'Ref control root retained DOM after unmount');
		current.model.assertReleased();
		current = null;
		assertPrimerHidden();
	}

	function prime(lane: 'after-activity' | 'live-hidden-activity' = 'after-activity') {
		ensure(current === null, 'Cannot prime Activity during a ref sample');
		ensure(!primed, 'Activity was already primed in this page');
		ensure(
			lane === 'after-activity' || lane === 'live-hidden-activity',
			`Unknown Activity primer lane: ${lane}`,
		);
		const container = document.createElement('div');
		document.body.appendChild(container);
		try {
			const release = primeActivity(
				container,
				lane === 'live-hidden-activity' ? ['visible', 'hidden'] : ['visible', 'hidden', 'visible'],
			);
			if (lane === 'live-hidden-activity') {
				const child = container.querySelector('span');
				ensure(
					child !== null && getComputedStyle(child).display === 'none',
					'Live Activity primer is not hidden',
				);
				primer = { container, release };
			} else {
				release();
				ensure(container.childNodes.length === 0, 'Primer retained DOM after unmount');
			}
		} finally {
			if (primer === null) container.remove();
		}
		primed = true;
	}

	function finish() {
		ensure(current === null, 'Clean up the measured ref tree before its primer');
		if (primer === null) return;
		const { container, release } = primer;
		primer = null;
		try {
			release();
			ensure(container.childNodes.length === 0, 'Live primer retained DOM after unmount');
		} finally {
			container.remove();
		}
	}

	function prepare(operation: Operation) {
		ensure(REF_OPERATIONS.includes(operation), `Unknown ref operation: ${operation}`);
		cleanup();
		const model = new RefModel();
		const session: Session = {
			operation,
			model,
			renderer: createRenderer(),
			props: {
				model,
				present: operation !== 'ref_mount_unmount',
				variant: 0,
				depth: operation === 'deep_ref_replacements' ? REF_DEPTH : 0,
			},
			nodes: null,
		};
		current = session;
		session.renderer.render(session.props);
		assertState(session);
		if (session.props.present) session.nodes = rows();
		model.resetSample();
	}

	function run(operation: Operation) {
		const session = sessionFor(operation);
		const started = performance.now();
		if (operation !== 'ref_mount_unmount') {
			for (let index = 1; index <= UPDATE_COUNT; index++) {
				render(session, { variant: (index % 2) as 0 | 1 });
			}
		} else {
			for (let index = 0; index < CYCLE_COUNT; index++) {
				render(session, { present: true });
				render(session, { present: false });
			}
		}
		return performance.now() - started;
	}

	function verify(operation: Operation) {
		const session = sessionFor(operation);
		assertState(session);
		const expected = ROW_COUNT * (operation === 'ref_mount_unmount' ? CYCLE_COUNT : UPDATE_COUNT);
		const counts = session.model.sample();
		ensure(
			counts.attaches === expected && counts.cleanups === expected,
			`${operation}: ref lifecycle ${JSON.stringify(counts)} != ${expected} pairs`,
		);
		return {
			rows: session.props.present ? ROW_COUNT : 0,
			variant: session.props.variant,
			depth: session.props.depth,
			counts,
			identitiesPreserved: true,
		};
	}

	function gate(operation: Operation) {
		prepare(operation);
		run(operation);
		const snapshot = verify(operation);
		cleanup();
		return snapshot;
	}

	Object.assign(window, {
		__activityRefBench: { prime, prepare, run, verify, cleanup, gate, finish },
		__activityRefPrime: prime,
		__activityRefPrepare: prepare,
		__activityRefRun: run,
		__activityRefVerify: verify,
		__activityRefCleanup: cleanup,
		__activityRefFinish: finish,
		__ready: true,
	});
}
