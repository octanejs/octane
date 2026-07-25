import { createSignal } from 'solid-js';
import { CARDS, INITIAL_VALUE } from '../../../../hydration-interactivity/shared.js';

type HydrationBenchmarkProps = {
	controlled?: boolean;
	deferred?: boolean;
};

export function App(props: HydrationBenchmarkProps) @{
	const [draft, setDraft] = createSignal(INITIAL_VALUE);
	const [clicks, setClicks] = createSignal(0);
	const onInput = (event: Event) => setDraft((event.currentTarget as HTMLInputElement).value);

	<main class="hydration-page">
		<h1>{'Hydration interactivity benchmark'}</h1>
		<section class="hydration-editor">
			<label for="hydration-input">{'Your draft'}</label>
			@if (props.controlled) {
				<input id="hydration-input" autocomplete="off" value={draft()} onInput={onInput} />
			} @else {
				<input id="hydration-input" autocomplete="off" onInput={onInput} />
			}
			<output id="hydration-output">{draft()}</output>
			<button
				id="hydration-action"
				type="button"
				onClick={() => setClicks(clicks() + 1)}
			>{'Record interaction'}</button>
			<output id="hydration-clicks">{String(clicks())}</output>
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
