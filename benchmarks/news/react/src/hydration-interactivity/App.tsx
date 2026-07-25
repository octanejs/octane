import { useState, type FormEvent } from 'react';
import { CARDS, INITIAL_VALUE } from '../../../../hydration-interactivity/shared.js';

type HydrationBenchmarkProps = {
	controlled?: boolean;
	deferred?: boolean;
};

export function App({ controlled = false }: HydrationBenchmarkProps) {
	const [draft, setDraft] = useState(INITIAL_VALUE);
	const [clicks, setClicks] = useState(0);
	const onInput = (event: FormEvent<HTMLInputElement>) => setDraft(event.currentTarget.value);

	return (
		<main className="hydration-page">
			<h1>Hydration interactivity benchmark</h1>
			<section className="hydration-editor">
				<label htmlFor="hydration-input">Your draft</label>
				{controlled ? (
					<input id="hydration-input" autoComplete="off" value={draft} onInput={onInput} />
				) : (
					<input id="hydration-input" autoComplete="off" onInput={onInput} />
				)}
				<output id="hydration-output">{draft}</output>
				<button id="hydration-action" type="button" onClick={() => setClicks(clicks + 1)}>
					Record interaction
				</button>
				<output id="hydration-clicks">{clicks}</output>
			</section>
			<ul id="hydration-cards">
				{CARDS.map((card) => (
					<li className="hydration-card" data-card-id={card.id} key={card.id}>
						<h2>{card.title}</h2>
						<p>{card.description}</p>
					</li>
				))}
			</ul>
		</main>
	);
}
