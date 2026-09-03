import { createRoot, flushSync } from 'octane';
import { App, TwoOwners, type Model, type Scenario } from './App.tsrx';

const scenario = new URLSearchParams(location.search).get('scenario') as Scenario;
const scenarios: Scenario[] = [
	'urgent',
	'single-owner',
	'repeat-owner',
	'two-owners',
	'two-updates',
];
if (!scenarios.includes(scenario)) throw new Error(`Unknown scenario: ${scenario}`);
const container = document.getElementById('main')!;
const model: Model = { step: () => {}, commits: 0, cleanups: 0 };
const root = createRoot(container);
root.render(scenario === 'two-owners' ? TwoOwners : App, { scenario, model });
const valueNode = document.getElementById('value')!;
const pendingNodes = Array.from(container.querySelectorAll('[data-pending]'));

function check(condition: boolean, message: string): void {
	if (!condition) throw new Error(`${scenario}: ${message}`);
}

const benchmark = {
	async verifyPending() {
		model.step();
		flushSync(() => {});
		const expected = scenario === 'urgent' ? 'false' : 'true';
		check(
			pendingNodes.every((node) => node.textContent === expected),
			'pending was not published',
		);
		await Promise.resolve();
		flushSync(() => {});
		check(
			pendingNodes.every((node) => node.textContent === 'false'),
			'pending did not settle',
		);
	},
	async run(cycles: number) {
		const before = Number(valueNode.textContent);
		const beforeCommits = model.commits;
		const start = performance.now();
		for (let i = 0; i < cycles; i++) {
			model.step();
			flushSync(() => {});
			await Promise.resolve();
			flushSync(() => {});
		}
		const duration = performance.now() - start;
		const increment = scenario === 'two-updates' ? 2 : 1;
		check(Number(valueNode.textContent) === before + cycles * increment, 'lost state updates');
		check(
			pendingNodes.every((node) => node.textContent === 'false'),
			'pending owner did not settle',
		);
		check(model.commits === beforeCommits + cycles, 'value commits did not match completed cycles');
		check(model.cleanups === model.commits - 1, 'layout effect cleanup did not follow commits');
		check(document.getElementById('value') === valueNode, 'the value host was replaced');
		return { duration, cycles, value: Number(valueNode.textContent), commits: model.commits };
	},
	unmount() {
		root.unmount();
		check(container.innerHTML === '', 'unmount retained content');
		check(model.cleanups === model.commits, 'unmount retained the layout effect');
	},
};

declare global {
	interface Window {
		transitionBenchmark: typeof benchmark;
	}
}
window.transitionBenchmark = benchmark;
