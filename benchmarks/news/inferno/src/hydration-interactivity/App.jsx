import { Component } from 'inferno';
import {
	CARDS,
	INITIAL_VALUE,
	readHydrationDraft,
} from '../../../../hydration-interactivity/shared.js';

export class App extends Component {
	constructor(props) {
		super(props);
		this.state = {
			draft: readHydrationDraft(),
			clicks: 0,
			focuses: 0,
			submitted: INITIAL_VALUE,
		};
	}

	onSend = () => {
		const query = document.querySelector('#hydration-input')?.value ?? INITIAL_VALUE;
		this.setState(({ clicks }) => ({ draft: query, submitted: query, clicks: clicks + 1 }));
	};

	render() {
		const { controlled = false } = this.props;
		const { draft, clicks, focuses, submitted } = this.state;
		const inputProps = controlled ? { value: draft } : {};
		return (
			<main class="hydration-page">
				<h1>Hydration interactivity benchmark</h1>
				<section class="hydration-editor">
					<label for="hydration-input">Search query</label>
					<input
						id="hydration-input"
						type="search"
						autocomplete="off"
						{...inputProps}
						onInput={(event) => this.setState({ draft: event.currentTarget.value })}
					/>
					<output id="hydration-output">{draft}</output>
					<button
						id="hydration-action"
						type="button"
						onClick={this.onSend}
						onFocus={() => this.setState({ focuses: focuses + 1 })}
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
}
