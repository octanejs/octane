import { Component } from 'inferno';
import {
	FORM_FIELDS,
	LIFECYCLE_ROWS,
	STORE_SUBSCRIBERS,
	getRuntimeStress,
	markFieldRender,
	markStoreRender,
	mountLifecycleResource,
	recordSubmission,
	recordValidation,
} from '../../../../runtime-stress/shared.js';

class LifecycleRow extends Component {
	componentDidMount() {
		this.cleanup = mountLifecycleResource(this.props.index);
	}

	componentWillUnmount() {
		this.cleanup?.();
	}

	render() {
		return (
			<li data-lifecycle-row={this.props.index}>{`${this.props.index}:${this.props.tick}`}</li>
		);
	}
}

class FormField extends Component {
	constructor(props) {
		super(props);
		this.state = { value: '' };
	}

	shouldComponentUpdate(nextProps, nextState) {
		return nextProps.index !== this.props.index || nextState.value !== this.state.value;
	}

	render() {
		const { index } = this.props;
		const { value } = this.state;
		markFieldRender(index);
		return (
			<label>
				<input
					name={`field-${index}`}
					data-field-index={index}
					value={value}
					onInput={(event) => {
						const next = event.currentTarget.value;
						this.setState({ value: next });
						recordValidation(next);
					}}
				/>
				<output data-field-output={index}>{value}</output>
			</label>
		);
	}
}

class StoreSubscriber extends Component {
	constructor(props) {
		super(props);
		this.store = getRuntimeStress().store;
		this.state = { value: this.store.get(props.index) };
	}

	componentDidMount() {
		this.unsubscribe = this.store.subscribe(() => {
			const value = this.store.get(this.props.index);
			if (value !== this.state.value) this.setState({ value });
		});
	}

	componentWillUnmount() {
		this.unsubscribe?.();
	}

	shouldComponentUpdate(nextProps, nextState) {
		return nextProps.index !== this.props.index || nextState.value !== this.state.value;
	}

	render() {
		markStoreRender(this.props.index);
		return <output data-subscriber-index={this.props.index}>{this.state.value}</output>;
	}
}

class AsyncStatus extends Component {
	constructor(props) {
		super(props);
		this.resource = getRuntimeStress().async;
		this.state = this.resource.getSnapshot();
	}

	componentDidMount() {
		this.unsubscribe = this.resource.subscribe(() => this.setState(this.resource.getSnapshot()));
	}

	componentWillUnmount() {
		this.unsubscribe?.();
	}

	render() {
		const { error, status, value } = this.state;
		return (
			<section aria-label="Async recovery">
				<button id="async-resolve" type="button" onClick={() => this.resource.run('resolve')}>
					Resolve request
				</button>
				<button id="async-reject" type="button" onClick={() => this.resource.run('reject')}>
					Reject request
				</button>
				<button id="async-slow" type="button" onClick={() => this.resource.run('slow', 'stale')}>
					Start slow request
				</button>
				<output id="async-status">{status}</output>
				<output id="async-value">{value}</output>
				<output id="async-error">{error}</output>
			</section>
		);
	}
}

export class App extends Component {
	constructor(props) {
		super(props);
		this.state = {
			lifecycleVisible: false,
			lifecycleTick: 0,
			storeVisible: false,
			resetVersion: 0,
			notifications: false,
			delivery: 'standard',
			audience: 'personal',
			conditional: false,
		};
	}

	render() {
		const state = this.state;
		const store = getRuntimeStress().store;
		return (
			<main>
				<section aria-label="Lifecycle soak">
					<button
						id="lifecycle-toggle"
						type="button"
						onClick={() => this.setState({ lifecycleVisible: !state.lifecycleVisible })}
					>
						Toggle lifecycle rows
					</button>
					<button
						id="lifecycle-update"
						type="button"
						onClick={() => this.setState({ lifecycleTick: state.lifecycleTick + 1 })}
					>
						Update lifecycle rows
					</button>
					{state.lifecycleVisible ? (
						<ul>
							{LIFECYCLE_ROWS.map((index) => (
								<LifecycleRow index={index} key={index} tick={state.lifecycleTick} />
							))}
						</ul>
					) : null}
				</section>

				<form id="stress-form" onSubmit={recordSubmission}>
					{FORM_FIELDS.map((index) => (
						<FormField index={index} key={`${state.resetVersion}:${index}`} />
					))}
					<label>
						<input
							id="form-checkbox"
							type="checkbox"
							name="notifications"
							value="enabled"
							checked={state.notifications}
							onChange={(event) => this.setState({ notifications: event.currentTarget.checked })}
						/>
						Notifications
					</label>
					<label>
						<input
							id="form-radio-standard"
							type="radio"
							name="delivery"
							value="standard"
							checked={state.delivery === 'standard'}
							onChange={() => this.setState({ delivery: 'standard' })}
						/>
						Standard
					</label>
					<label>
						<input
							id="form-radio-express"
							type="radio"
							name="delivery"
							value="express"
							checked={state.delivery === 'express'}
							onChange={() => this.setState({ delivery: 'express' })}
						/>
						Express
					</label>
					<select
						id="form-select"
						name="audience"
						value={state.audience}
						onChange={(event) => this.setState({ audience: event.currentTarget.value })}
					>
						<option value="personal">Personal</option>
						<option value="team">Team</option>
					</select>
					<button
						id="form-conditional-toggle"
						type="button"
						onClick={() => this.setState({ conditional: !state.conditional })}
					>
						Toggle conditional section
					</button>
					{state.conditional ? (
						<aside id="form-conditional">Conditional validation section</aside>
					) : null}
					<button id="form-submit" type="submit">
						Send form
					</button>
					<button
						id="form-reset"
						type="button"
						onClick={() =>
							this.setState({
								resetVersion: state.resetVersion + 1,
								notifications: false,
								delivery: 'standard',
								audience: 'personal',
								conditional: false,
							})
						}
					>
						Reset form
					</button>
				</form>

				<section aria-label="External store">
					<button
						id="store-toggle"
						type="button"
						onClick={() => this.setState({ storeVisible: !state.storeVisible })}
					>
						Toggle store subscribers
					</button>
					<button id="store-narrow" type="button" onClick={() => store.writeOne(17, 1)}>
						Write one subscriber
					</button>
					<button id="store-broad" type="button" onClick={() => store.writeAll(7)}>
						Write all subscribers
					</button>
					<button
						id="store-rapid"
						type="button"
						onClick={() => {
							store.writeOne(17, 8);
							store.writeOne(17, 9);
							store.writeOne(17, 10);
						}}
					>
						Write rapid updates
					</button>
					{state.storeVisible ? (
						<div id="store-subscribers">
							{STORE_SUBSCRIBERS.map((index) => (
								<StoreSubscriber index={index} key={index} />
							))}
						</div>
					) : null}
				</section>
				<AsyncStatus />
			</main>
		);
	}
}
