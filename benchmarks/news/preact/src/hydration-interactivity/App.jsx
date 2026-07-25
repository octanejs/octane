import { useState } from 'preact/hooks';
import { CARDS, INITIAL_VALUE } from '../../../../hydration-interactivity/shared.js';

export function App({ controlled = false }) {
	const [draft, setDraft] = useState(INITIAL_VALUE);
	const [clicks, setClicks] = useState(0);
	const onInput = (event) => setDraft(event.currentTarget.value);

	return (
		<main class="hydration-page">
			<h1>Hydration interactivity benchmark</h1>
			<section class="hydration-editor">
				<label for="hydration-input">Your draft</label>
				{controlled ? (
					<input id="hydration-input" autocomplete="off" value={draft} onInput={onInput} />
				) : (
					<input id="hydration-input" autocomplete="off" onInput={onInput} />
				)}
				<output id="hydration-output">{draft}</output>
				<button id="hydration-action" type="button" onClick={() => setClicks(clicks + 1)}>
					Record interaction
				</button>
				<output id="hydration-clicks">{clicks}</output>
			</section>
			<ul id="hydration-cards">
				{CARDS.map((card) => (
					<li class="hydration-card" data-card-id={card.id} key={card.id}>
						<h2>{card.title}</h2>
						<p>{card.description}</p>
					</li>
				))}
			</ul>
		</main>
	);
}
