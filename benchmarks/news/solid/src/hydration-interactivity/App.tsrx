import { createEffect, createSignal } from 'solid-js';
import {
	CARDS,
	INITIAL_VALUE,
	readHydrationDraft,
} from '../../../../hydration-interactivity/shared.js';

type HydrationBenchmarkProps = {
	controlled?: boolean;
	deferred?: boolean;
};

export function App(props: HydrationBenchmarkProps) @{
	const hydrationDraft = readHydrationDraft();
	const [draft, setDraft] = createSignal(INITIAL_VALUE);
	const [clicks, setClicks] = createSignal(0);
	const [focuses, setFocuses] = createSignal(0);
	const [submitted, setSubmitted] = createSignal(INITIAL_VALUE);
	createEffect(() => hydrationDraft, (value) => {
		if (value !== INITIAL_VALUE) setDraft(value);
	}, { ssrSource: 'client' });
	const onInput = (event: Event) => setDraft((event.currentTarget as HTMLInputElement).value);
	const onSend = () => {
		const input = document.querySelector<HTMLInputElement>('#hydration-input');
		const query = input?.value ?? INITIAL_VALUE;
		setDraft(query);
		setSubmitted(query);
		setClicks(clicks() + 1);
	};

	<main class="hydration-page">
		<h1>{'Hydration interactivity benchmark'}</h1>
		<section class="hydration-editor">
			<label for="hydration-input">{'Search query'}</label>
			@if (props.controlled) {
				<input
					id="hydration-input"
					type="search"
					autocomplete="off"
					value={draft()}
					onInput={onInput}
				/>
			} @else {
				<input id="hydration-input" type="search" autocomplete="off" onInput={onInput} />
			}
			<output id="hydration-output">{draft()}</output>
			<button
				id="hydration-action"
				type="button"
				onClick={onSend}
				onFocus={() => setFocuses(focuses() + 1)}
			>{'Send search'}</button>
			<output id="hydration-clicks">{String(clicks())}</output>
			<output id="hydration-focuses">{String(focuses())}</output>
			<output id="hydration-submitted">{submitted()}</output>
		</section>
		<ul id="hydration-cards">
			@for (const card of CARDS) {
				<li class="hydration-card" data-card-id={card.id}>
					<h2>{card.title}</h2>
					<p>{card.description}</p>
				</li>
			}
		</ul>
	</main>
}
