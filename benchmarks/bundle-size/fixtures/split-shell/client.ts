import { attachBehaviorRoot } from 'octane/behavior';
import { initializeHydrationEventCapture } from 'octane/hydration';
import { likes$ } from './state.ts';

// The client entry of a server-rendered shell: capture early input, activate a
// renderer-free island, then load and hydrate the application.
export async function run(container: HTMLElement, html: string) {
	const document = container.ownerDocument;
	container.innerHTML = html;
	initializeHydrationEventCapture(document);
	const island = document.createElement('aside');
	island.innerHTML = '<button id="island-like">like</button>';
	document.body.append(island);
	const behavior = attachBehaviorRoot(island);
	behavior.registerBehavior({
		target: '#island-like',
		events: ['click'],
		adopt() {},
		handleEvent() {
			likes$.set(likes$.get() + 1);
		},
	});
	await behavior.ready;

	const serverShell = container.querySelector('#shell');
	const { flushSync, hydrate } = await import('./app.ts');
	const root = hydrate(container);
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
	const adopted = container.querySelector('#shell') === serverShell;
	const greeting = container.querySelector('#shell-greeting')?.textContent;

	(island.querySelector('#island-like') as HTMLButtonElement).click();
	flushSync(() => {});
	const likes = container.querySelector('#shell-like')?.textContent;
	flushSync(() => (container.querySelector('#shell-menu-toggle') as HTMLButtonElement).click());
	const menu = document.querySelector('#shell-menu')?.textContent;
	(container.querySelector('#shell-navigate') as HTMLButtonElement).click();
	const deadline = Date.now() + 2_000;
	while (container.querySelector('#shell-settings') === null || document.title !== 'settings') {
		if (Date.now() > deadline) throw new Error('The settings route never committed.');
		await new Promise<void>((resolve) => setTimeout(resolve, 10));
	}
	const settings = (container.querySelector('#shell-settings-name') as HTMLInputElement).value;

	root.unmount();
	behavior.dispose();
	island.remove();
	return {
		adopted,
		greeting,
		likes,
		menu,
		settings,
		menuCleaned: document.querySelector('#shell-menu') === null,
		cleaned: container.childNodes.length === 0,
	};
}
