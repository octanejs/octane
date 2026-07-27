import { memo, useEffect, useState, useSyncExternalStore } from 'react';
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

type IndexedProps = { index: number };

function LifecycleRow({ index, tick }: IndexedProps & { tick: number }) {
	useEffect(() => mountLifecycleResource(index), [index]);
	return <li data-lifecycle-row={index}>{`${index}:${tick}`}</li>;
}

const FormField = memo(function FormField({ index }: IndexedProps) {
	const [value, setValue] = useState('');
	markFieldRender(index);
	return (
		<label>
			<input
				name={`field-${index}`}
				data-field-index={index}
				value={value}
				onInput={(event) => {
					const next = event.currentTarget.value;
					setValue(next);
					recordValidation(next);
				}}
			/>
			<output data-field-output={index}>{value}</output>
		</label>
	);
});

const StoreSubscriber = memo(function StoreSubscriber({ index }: IndexedProps) {
	const store = getRuntimeStress().store;
	const value = useSyncExternalStore(
		store.subscribe,
		() => store.get(index),
		() => 0,
	);
	markStoreRender(index);
	return <output data-subscriber-index={index}>{value}</output>;
});

function AsyncStatus() {
	const resource = getRuntimeStress().async;
	const snapshot = useSyncExternalStore(
		resource.subscribe,
		resource.getSnapshot,
		resource.getSnapshot,
	);
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
			<output id="async-status">{snapshot.status}</output>
			<output id="async-value">{snapshot.value}</output>
			<output id="async-error">{snapshot.error}</output>
		</section>
	);
}

export function App() {
	const [lifecycleVisible, setLifecycleVisible] = useState(false);
	const [lifecycleTick, setLifecycleTick] = useState(0);
	const [storeVisible, setStoreVisible] = useState(false);
	const [resetVersion, setResetVersion] = useState(0);
	const [notifications, setNotifications] = useState(false);
	const [delivery, setDelivery] = useState('standard');
	const [audience, setAudience] = useState('personal');
	const [conditional, setConditional] = useState(false);
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
				{lifecycleVisible && (
					<ul>
						{LIFECYCLE_ROWS.map((index) => (
							<LifecycleRow index={index} key={index} tick={lifecycleTick} />
						))}
					</ul>
				)}
			</section>

			<form id="stress-form" onSubmit={recordSubmission}>
				{FORM_FIELDS.map((index) => (
					<FormField index={index} key={`${resetVersion}:${index}`} />
				))}
				<label>
					<input
						id="form-checkbox"
						type="checkbox"
						name="notifications"
						value="enabled"
						checked={notifications}
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
						checked={delivery === 'standard'}
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
						checked={delivery === 'express'}
						onChange={() => setDelivery('express')}
					/>
					Express
				</label>
				<select
					id="form-select"
					name="audience"
					value={audience}
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
				{conditional && <aside id="form-conditional">Conditional validation section</aside>}
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
				{storeVisible && (
					<div id="store-subscribers">
						{STORE_SUBSCRIBERS.map((index) => (
							<StoreSubscriber index={index} key={index} />
						))}
					</div>
				)}
			</section>
			<AsyncStatus />
		</main>
	);
}
