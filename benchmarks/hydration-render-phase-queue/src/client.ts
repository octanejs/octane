import { createRoot, flushSync, hydrateRoot } from 'octane';
import { ForeignRows, queueForeignUpdates, TargetRows } from './fixture.tsrx';

export interface HydrationQueueCase {
	durationMs: number;
	foreignRows: number;
	foreignWorkPreserved: boolean;
	interactionHandled: boolean;
	serverNodesAdopted: boolean;
	targetRows: number;
	unmountClean: boolean;
}

function rows(container: HTMLElement, selector: string): HTMLElement[] {
	return Array.from(container.querySelectorAll<HTMLElement>(selector));
}

function everyRowHasText(elements: HTMLElement[], expected: string): boolean {
	for (let index = 0; index < elements.length; index++) {
		if (elements[index].textContent !== expected) return false;
	}
	return true;
}

export function runHydrationQueueCase(
	foreignContainer: HTMLElement,
	targetContainer: HTMLElement,
	count: number,
): HydrationQueueCase {
	const foreignRoot = createRoot(foreignContainer);
	foreignRoot.render(ForeignRows, { count });
	const foreign = rows(foreignContainer, '[data-hydration-queue-foreign-row]');
	const serverTargets = rows(targetContainer, '[data-hydration-queue-target-row]');
	if (
		foreign.length !== count ||
		serverTargets.length !== count ||
		!everyRowHasText(foreign, 'foreign:0') ||
		!everyRowHasText(serverTargets, 'target:2')
	) {
		foreignRoot.unmount();
		throw new Error(`The ${count}-row setup did not produce the expected public DOM.`);
	}

	queueForeignUpdates(count);
	const started = performance.now();
	const targetRoot = hydrateRoot(targetContainer, TargetRows, { count, settle: true });
	const durationMs = performance.now() - started;

	const hydratedTargets = rows(targetContainer, '[data-hydration-queue-target-row]');
	const serverNodesAdopted =
		hydratedTargets.length === count &&
		hydratedTargets.every((node, index) => node === serverTargets[index]);
	const targetConverged = everyRowHasText(hydratedTargets, 'target:2');
	const foreignStayedPending = everyRowHasText(foreign, 'foreign:0');
	if (!serverNodesAdopted || !targetConverged || !foreignStayedPending) {
		targetRoot.unmount();
		foreignRoot.unmount();
		throw new Error(
			`The ${count}-row hydration did not converge, adopt, or isolate its queued roots.`,
		);
	}

	flushSync(() => {});
	const foreignWorkPreserved = everyRowHasText(foreign, 'foreign:1');
	const firstTarget = hydratedTargets[0] as HTMLButtonElement | undefined;
	if (!foreignWorkPreserved || firstTarget === undefined) {
		targetRoot.unmount();
		foreignRoot.unmount();
		throw new Error(`The ${count}-row ordinary scheduler flush lost queued foreign work.`);
	}
	flushSync(() => firstTarget.click());
	const interactionHandled = firstTarget.textContent === 'target:3';

	targetRoot.unmount();
	foreignRoot.unmount();
	const unmountClean =
		targetContainer.childNodes.length === 0 && foreignContainer.childNodes.length === 0;
	if (!interactionHandled || !unmountClean) {
		throw new Error(`The ${count}-row interaction or cleanup control failed.`);
	}

	return {
		durationMs,
		foreignRows: foreign.length,
		foreignWorkPreserved,
		interactionHandled,
		serverNodesAdopted,
		targetRows: hydratedTargets.length,
		unmountClean,
	};
}
