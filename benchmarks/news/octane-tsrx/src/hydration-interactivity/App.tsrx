import { Hydrate, useState } from 'octane';
import { interaction } from 'octane/hydration';
import { CARDS, INITIAL_VALUE } from '../../../../hydration-interactivity/shared.js';

type HydrationBenchmarkProps = {
	controlled?: boolean;
	deferred?: boolean;
};

function Editor(props: HydrationBenchmarkProps) @{
	const [draft, setDraft] = useState(INITIAL_VALUE);
	const [clicks, setClicks] = useState(0);
	const [focuses, setFocuses] = useState(0);
	const [submitted, setSubmitted] = useState(INITIAL_VALUE);
	const onInput = (event: Event) => setDraft((event.currentTarget as HTMLInputElement).value);
	const onSend = () => {
		const input = document.querySelector<HTMLInputElement>('#hydration-input');
		const query = input?.value ?? INITIAL_VALUE;
		setDraft(query);
		setSubmitted(query);
		setClicks(clicks + 1);
	};

	<section class="hydration-editor">
		<label for="hydration-input">{'Search query'}</label>
		@if (props.controlled) {
			<input
				id="hydration-input"
				type="search"
				autocomplete="off"
				value={draft}
				onInput={onInput}
			/>
		} @else {
			<input id="hydration-input" type="search" autocomplete="off" onInput={onInput} />
		}
		<output id="hydration-output">{draft as string}</output>
		<button
			id="hydration-action"
			type="button"
			onClick={onSend}
			onFocus={() => setFocuses(focuses + 1)}
		>{'Send search'}</button>
		<output id="hydration-clicks">{String(clicks) as string}</output>
		<output id="hydration-focuses">{String(focuses) as string}</output>
		<output id="hydration-submitted">{submitted as string}</output>
	</section>
}

export function App(props: HydrationBenchmarkProps) @{
	<main class="hydration-page">
		<h1>{'Hydration interactivity benchmark'}</h1>
		@if (props.deferred) {
			<Hydrate when={interaction()} split={false}>
				<Editor controlled={props.controlled} />
			</Hydrate>
		} @else {
			<Editor controlled={props.controlled} />
		}
		<ul id="hydration-cards">
			@for (const card of CARDS; key card.id) {
				<li class="hydration-card" data-card-id={card.id}>
					<h2>{card.title as string}</h2>
					<p>{card.description as string}</p>
				</li>
			}
		</ul>
	</main>
}
