import { Component } from 'inferno';
import {
	SELECTOR_SUBSCRIBERS,
	getStoreSelectorStress,
	markSubscriberRender,
	selectTotal,
} from '../../../../store-selector-fanout/shared.js';

class StoreSubscriber extends Component {
	constructor(props) {
		super(props);
		this.store = getStoreSelectorStress().store;
		this.state = { total: selectTotal(this.store.getSnapshot().values) };
	}

	componentDidMount() {
		this.unsubscribe = this.store.subscribe(() => {
			this.setState({ total: selectTotal(this.store.getSnapshot().values) });
		});
	}

	componentWillUnmount() {
		this.unsubscribe?.();
	}

	render() {
		const { total } = this.state;
		markSubscriberRender();
		return (
			<output data-subscriber-index={this.props.index} data-generation={this.props.generation}>
				{total}
			</output>
		);
	}
}

export class App extends Component {
	constructor(props) {
		super(props);
		this.state = { visible: false, generation: 0 };
		this.stress = getStoreSelectorStress();
		this.stress.bump = () => this.setState(({ generation }) => ({ generation: generation + 1 }));
	}

	render() {
		const { visible, generation } = this.state;
		const store = this.stress.store;
		return (
			<main>
				<button
					id="selector-toggle"
					type="button"
					onClick={() => this.setState({ visible: !visible })}
				>
					Toggle subscribers
				</button>
				<button id="selector-write" type="button" onClick={() => store.writeAll(7)}>
					Write every store value
				</button>
				<button id="selector-rewrite" type="button" onClick={() => store.writeAll(9)}>
					Rewrite every store value
				</button>
				<output id="selector-generation">{generation}</output>
				{visible ? (
					<div id="selector-subscribers">
						{SELECTOR_SUBSCRIBERS.map((index) => (
							<StoreSubscriber generation={generation} index={index} key={index} />
						))}
					</div>
				) : null}
			</main>
		);
	}
}
