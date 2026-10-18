import { createRoot, startTransition, useState, ViewTransition } from 'octane';

let update: (value: number) => void;
let events = 0;
let layouts = 0;
function App(props: { count: number; scoped: boolean }) @{
	const [generation, setGeneration] = useState(0);
	const scope = props.scoped ? { scope: 'element' as const } : {};
	update = setGeneration;
	<main>
		@for (const id of Array.from({ length: props.count }, (_, index) => index); key id) {
			<ViewTransition {...scope}>
				<section data-id={String(id)}>
					<ViewTransition
						name={'item-' + id}
						onUpdate={() => {
							layouts++;
						}}
					>
						<button
							onClick={() => {
								events++;
							}}
						>
							{String(generation)}
						</button>
					</ViewTransition>
					<input defaultValue="draft" />
				</section>
			</ViewTransition>
		}
	</main>
}

export function mount(count: number, scoped: boolean) {
	const root = createRoot(document.querySelector('#root')!);
	root.render(App, { count, scoped });
	const buttons = [...document.querySelectorAll('button')];
	const inputs = [...document.querySelectorAll('input')];
	inputs[0].value = 'edited';
	inputs[0].focus();
	return {
		start(value: number) {
			startTransition(() => update(value));
		},
		check(value: number) {
			const current = [...document.querySelectorAll('button')];
			if (
				current.length !== count ||
				current.some((button, i) => button !== buttons[i] || button.textContent !== String(value))
			)
				throw Error('buttons changed');
			if (inputs[0].value !== 'edited' || document.activeElement !== inputs[0])
				throw Error('draft/focus changed');
			current[0].click();
			return {
				count,
				generation: value,
				events,
				layouts,
				draft: inputs[0].value,
				identity: true,
				focus: true,
			};
		},
		unmount() {
			root.unmount();
			if (document.querySelector('#root')!.textContent !== '') throw Error('unmount failed');
		},
	};
}
