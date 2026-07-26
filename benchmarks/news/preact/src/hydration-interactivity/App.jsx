import { useState } from 'preact/hooks';
import {
	CARDS,
	INITIAL_VALUE,
	readHydrationDraft,
} from '../../../../hydration-interactivity/shared.js';

export function App({ controlled = false }) {
	const [draft, setDraft] = useState(readHydrationDraft);
	const [clicks, setClicks] = useState(0);
	const [focuses, setFocuses] = useState(0);
	const [submitted, setSubmitted] = useState(INITIAL_VALUE);
	const onInput = (event) => setDraft(event.currentTarget.value);
	const onSend = () => {
		const input = document.querySelector('#hydration-input');
		const query = input?.value ?? INITIAL_VALUE;
		setDraft(query);
		setSubmitted(query);
		setClicks((count) => count + 1);
	};

	return (
		<main class="hydration-page">
			<h1>Hydration interactivity benchmark</h1>
			<section class="hydration-editor">
				<label for="hydration-input">Search query</label>
				{controlled ? (
					<input
						id="hydration-input"
						type="search"
						autocomplete="off"
						value={draft}
						onInput={onInput}
					/>
				) : (
					<input id="hydration-input" type="search" autocomplete="off" onInput={onInput} />
				)}
				<output id="hydration-output">{draft}</output>
				<button
					id="hydration-action"
					type="button"
					onClick={onSend}
					onFocus={() => setFocuses((count) => count + 1)}
				>
					Send search
				</button>
				<output id="hydration-clicks">{clicks}</output>
				<output id="hydration-focuses">{focuses}</output>
				<output id="hydration-submitted">{submitted}</output>
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
