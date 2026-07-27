import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js';
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

function LifecycleRow(props) {
	let release = () => {};
	createEffect(
		() => {},
		() => {
			release = mountLifecycleResource(props.index);
		},
	);
	onCleanup(() => release());
	return (
		<li data-lifecycle-row={props.index}>
			{props.index}:{props.tick()}
		</li>
	);
}

function FormField(props) {
	const [value, setValue] = createSignal('');
	markFieldRender(props.index);
	return (
		<label>
			<input
				name={`field-${props.index}`}
				data-field-index={props.index}
				value={value()}
				onInput={(event) => {
					const next = event.currentTarget.value;
					setValue(next);
					recordValidation(next);
				}}
			/>
			<output data-field-output={props.index}>{value()}</output>
		</label>
	);
}

function StoreSubscriber(props) {
	const store = getRuntimeStress().store;
	const [value, setValue] = createSignal(store.get(props.index));
	const unsubscribe = store.subscribe(() => setValue(store.get(props.index)));
	onCleanup(unsubscribe);
	createEffect(
		() => value(),
		() => markStoreRender(props.index),
	);
	return <output data-subscriber-index={props.index}>{value()}</output>;
}

function AsyncStatus() {
	const resource = getRuntimeStress().async;
	const [snapshot, setSnapshot] = createSignal(resource.getSnapshot());
	const unsubscribe = resource.subscribe(() => setSnapshot(resource.getSnapshot()));
	onCleanup(unsubscribe);
	return (
		<section aria-label="Async recovery">
			<button id="async-resolve" type="button" onClick={() => resource.run('resolve')}>
				Resolve request
			</button>
			<button id="async-reject" type="button" onClick={() => resource.run('reject')}>
				Reject request
			</button>
			<button id="async-slow" type="button" onClick={() => resource.run('slow', 'stale')}>
				Start slow request
			</button>
			<output id="async-status">{snapshot().status}</output>
			<output id="async-value">{snapshot().value}</output>
			<output id="async-error">{snapshot().error}</output>
		</section>
	);
}

export function App() {
	const [lifecycleVisible, setLifecycleVisible] = createSignal(false);
	const [lifecycleTick, setLifecycleTick] = createSignal(0);
	const [storeVisible, setStoreVisible] = createSignal(false);
	const [resetVersion, setResetVersion] = createSignal(0);
	const [notifications, setNotifications] = createSignal(false);
	const [delivery, setDelivery] = createSignal('standard');
	const [audience, setAudience] = createSignal('personal');
	const [conditional, setConditional] = createSignal(false);
	const store = getRuntimeStress().store;

	return (
		<main>
			<section aria-label="Lifecycle soak">
				<button
					id="lifecycle-toggle"
					type="button"
					onClick={() => setLifecycleVisible((visible) => !visible)}
				>
					Toggle lifecycle rows
				</button>
				<button
					id="lifecycle-update"
					type="button"
					onClick={() => setLifecycleTick((tick) => tick + 1)}
				>
					Update lifecycle rows
				</button>
				<Show when={lifecycleVisible()}>
					<ul>
						<For each={LIFECYCLE_ROWS}>
							{(index) => <LifecycleRow index={index} tick={lifecycleTick} />}
						</For>
					</ul>
				</Show>
			</section>

			<form id="stress-form" onSubmit={recordSubmission}>
				<For each={FORM_FIELDS.map((index) => ({ index, version: resetVersion() }))}>
					{(field) => <FormField index={field.index} />}
				</For>
				<label>
					<input
						id="form-checkbox"
						type="checkbox"
						name="notifications"
						value="enabled"
						checked={notifications()}
						onChange={(event) => setNotifications(event.currentTarget.checked)}
					/>
					Notifications
				</label>
				<label>
					<input
						id="form-radio-standard"
						type="radio"
						name="delivery"
						value="standard"
						checked={delivery() === 'standard'}
						onChange={() => setDelivery('standard')}
					/>
					Standard
				</label>
				<label>
					<input
						id="form-radio-express"
						type="radio"
						name="delivery"
						value="express"
						checked={delivery() === 'express'}
						onChange={() => setDelivery('express')}
					/>
					Express
				</label>
				<select
					id="form-select"
					name="audience"
					value={audience()}
					onChange={(event) => setAudience(event.currentTarget.value)}
				>
					<option value="personal">Personal</option>
					<option value="team">Team</option>
				</select>
				<button
					id="form-conditional-toggle"
					type="button"
					onClick={() => setConditional((visible) => !visible)}
				>
					Toggle conditional section
				</button>
				<Show when={conditional()}>
					<aside id="form-conditional">Conditional validation section</aside>
				</Show>
				<button id="form-submit" type="submit">
					Send form
				</button>
				<button
					id="form-reset"
					type="button"
					onClick={() => {
						setResetVersion((version) => version + 1);
						setNotifications(false);
						setDelivery('standard');
						setAudience('personal');
						setConditional(false);
					}}
				>
					Reset form
				</button>
			</form>

			<section aria-label="External store">
				<button
					id="store-toggle"
					type="button"
					onClick={() => setStoreVisible((visible) => !visible)}
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
				<Show when={storeVisible()}>
					<div id="store-subscribers">
						<For each={STORE_SUBSCRIBERS}>{(index) => <StoreSubscriber index={index} />}</For>
					</div>
				</Show>
			</section>
			<AsyncStatus />
		</main>
	);
}
