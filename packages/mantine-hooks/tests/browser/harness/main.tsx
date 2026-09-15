/** @jsxImportSource octane */
import { createRoot, hydrateRoot, flushSync } from 'octane';
import { HooksFixture, type FixtureProps } from './fixture';
const container = document.querySelector<HTMLElement>('#root')!;
const output = document.querySelector<HTMLOutputElement>('#observations')!;
const before = container.querySelector('#survivor');
const events: Array<{ kind: string; value: string | number }> = [];
let value = 'initial';
let epoch = 0;
let expanded = false;
const props = (): FixtureProps => ({
	value,
	epoch,
	expanded,
	onEvent: (kind, value) => {
		events.push({ kind, value });
		output.value = JSON.stringify(events);
	},
});
const hydrating = container.childNodes.length > 0;
const root = hydrating ? hydrateRoot(container, HooksFixture, props()) : createRoot(container);
if (!hydrating) root.render(HooksFixture, props());
container.dataset.adopted = String(
	before !== null && before === container.querySelector('#survivor'),
);
const render = () => flushSync(() => root.render(HooksFixture, props()));
for (const next of ['a', 'ab', 'abc'])
	document.querySelector('#value-' + next)!.addEventListener('click', () => {
		value = next;
		render();
	});
document.querySelector('#toggle')!.addEventListener('click', () => {
	expanded = !expanded;
	render();
});
document.querySelector('#rapid')!.addEventListener('click', () => {
	const timer = setInterval(() => {
		epoch++;
		render();
		if (epoch === 10) clearInterval(timer);
	}, 15);
});
document.querySelector('#unmount')!.addEventListener('click', () => root.unmount());
output.value = JSON.stringify(events);
container.dataset.ready = 'true';
