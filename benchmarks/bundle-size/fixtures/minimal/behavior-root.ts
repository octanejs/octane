import { attachBehaviorRoot } from 'octane/behavior';

export async function run(container: HTMLElement) {
	container.innerHTML = '<section><button>Activate</button><output>0</output></section>';
	const section = container.querySelector('section')!;
	const button = section.querySelector('button')!;
	const output = section.querySelector('output')!;
	const owner = {};
	const root = attachBehaviorRoot(container);
	const range = root.registerExternalRange(section, { owner });
	let adopted = false;
	let ownerMatched = false;
	let clicks = 0;
	let cleanups = 0;
	const registration = root.registerBehavior({
		target: 'button',
		owner,
		events: ['click'],
		adopt(element, context) {
			adopted = element === button;
			ownerMatched = context.range?.owner === owner;
			return () => {
				cleanups++;
			};
		},
		handleEvent() {
			output.textContent = String(++clicks);
		},
	});
	await root.ready;
	const before = output.textContent;
	button.click();
	const after = output.textContent;
	root.dispose();
	button.click();
	return {
		adopted,
		ownerMatched,
		before,
		after,
		afterDispose: output.textContent,
		cleanups,
		preserved: container.firstElementChild === section && section.firstElementChild === button,
		aborted: root.signal.aborted && registration.signal.aborted && range.signal.aborted,
	};
}
