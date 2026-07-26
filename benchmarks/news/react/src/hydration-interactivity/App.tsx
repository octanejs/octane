import { Suspense, useState, type FormEvent } from 'react';
import { CARDS, INITIAL_VALUE } from '../../../../hydration-interactivity/shared.js';

type HydrationBenchmarkProps = {
	controlled?: boolean;
	deferred?: boolean;
};

export function Editor({ controlled = false }: HydrationBenchmarkProps) {
	const [draft, setDraft] = useState(INITIAL_VALUE);
	const [clicks, setClicks] = useState(0);
	const [focuses, setFocuses] = useState(0);
	const [submitted, setSubmitted] = useState(INITIAL_VALUE);
	const onInput = (event: FormEvent<HTMLInputElement>) => setDraft(event.currentTarget.value);
	const onSend = () => {
		const input = document.querySelector<HTMLInputElement>('#hydration-input');
		const query = input?.value ?? INITIAL_VALUE;
		setDraft(query);
		setSubmitted(query);
		setClicks((count) => count + 1);
	};

	return (
		<section className="hydration-editor">
			<label htmlFor="hydration-input">Search query</label>
			{controlled ? (
				<input
					id="hydration-input"
					type="search"
					autoComplete="off"
					value={draft}
					onInput={onInput}
				/>
			) : (
				<input id="hydration-input" type="search" autoComplete="off" onInput={onInput} />
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
	);
}

export function App({ controlled = false, deferred = false }: HydrationBenchmarkProps) {
	return (
		<main className="hydration-page">
			<h1>Hydration interactivity benchmark</h1>
			{deferred ? (
				<Suspense fallback={null}>
					<Editor controlled={controlled} />
				</Suspense>
			) : (
				<Editor controlled={controlled} />
			)}
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
