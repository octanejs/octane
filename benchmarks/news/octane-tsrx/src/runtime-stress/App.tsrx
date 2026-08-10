import { useEffect, useState, useSyncExternalStore } from 'octane';
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

function observeDelegatedInputCapture(event: Event) {
	const benchmark = globalThis as
		typeof globalThis & {
			__octaneDelegatedInputCapture?: (event: Event) => void;
		};
	benchmark.__octaneDelegatedInputCapture?.(event);
}

function LifecycleRow(props: IndexedProps & { tick: number }) @{
	useEffect(() => mountLifecycleResource(props.index), []);
	<li data-lifecycle-row={String(props.index)}>{String(props.index) + ':' + props.tick}</li>
}

function FormField(props: IndexedProps & { resetVersion: number }) @{
	const [value, setValue] = useState('');
	useEffect(() => {
		setValue('');
	}, [props.resetVersion]);
	markFieldRender(props.index);
	const onInput = (event: Event) => {
		const next = (event.currentTarget as HTMLInputElement).value;
		setValue(next);
		recordValidation(next);
	};

	<label>
		<input
			name={'field-' + props.index}
			data-field-index={String(props.index)}
			value={value}
			onInput={onInput}
		/>
		<output data-field-output={String(props.index)}>{value as string}</output>
	</label>
}

function StoreSubscriber(props: IndexedProps) @{
	const store = getRuntimeStress().store;
	const value = useSyncExternalStore(store.subscribe, () => store.get(props.index), () => 0);
	markStoreRender(props.index);
	<output data-subscriber-index={String(props.index)}>{String(value) as string}</output>
}

function AsyncStatus() @{
	const resource = getRuntimeStress().async;
	const snapshot = useSyncExternalStore(
		resource.subscribe,
		resource.getSnapshot,
		resource.getSnapshot,
	);
	<section aria-label="Async recovery">
		<button
			id="async-resolve"
			type="button"
			onClick={() => resource.run('resolve')}
		>{'Resolve request'}</button>
		<button
			id="async-reject"
			type="button"
			onClick={() => resource.run('reject')}
		>{'Reject request'}</button>
		<button
			id="async-slow"
			type="button"
			onClick={() => resource.run('slow', 'stale')}
		>{'Start slow request'}</button>
		<output id="async-status">{snapshot.status as string}</output>
		<output id="async-value">{snapshot.value as string}</output>
		<output id="async-error">{snapshot.error as string}</output>
	</section>
}

export function App() @{
	const [lifecycleVisible, setLifecycleVisible] = useState(false);
	const [lifecycleTick, setLifecycleTick] = useState(0);
	const [storeVisible, setStoreVisible] = useState(false);
	const [resetVersion, setResetVersion] = useState(0);
	const [notifications, setNotifications] = useState(false);
	const [delivery, setDelivery] = useState('standard');
	const [audience, setAudience] = useState('personal');
	const [conditional, setConditional] = useState(false);
	const store = getRuntimeStress().store;

	const reset = () => {
		setResetVersion((version) => version + 1);
		setNotifications(false);
		setDelivery('standard');
		setAudience('personal');
		setConditional(false);
	};

	<main>
		<section aria-label="Lifecycle soak">
			<button
				id="lifecycle-toggle"
				type="button"
				onClick={() => setLifecycleVisible((visible) => !visible)}
			>{'Toggle lifecycle rows'}</button>
			<button
				id="lifecycle-update"
				type="button"
				onClick={() => setLifecycleTick((tick) => tick + 1)}
			>{'Update lifecycle rows'}</button>
			@if (lifecycleVisible) {
				<ul>
					@for (const index of LIFECYCLE_ROWS; key index) {
						<LifecycleRow index={index} tick={lifecycleTick} />
					}
				</ul>
			}
		</section>

		<form
			id="stress-form"
			onSubmit={recordSubmission}
			onInputCapture={observeDelegatedInputCapture}
		>
			@for (const index of FORM_FIELDS; key index) {
				<FormField index={index} resetVersion={resetVersion} />
			}
			<label>
				<input
					id="form-checkbox"
					type="checkbox"
					name="notifications"
					value="enabled"
					checked={notifications}
					onChange={(event: Event) => setNotifications(
						(event.currentTarget as HTMLInputElement).checked,
					)}
				/>
				{'Notifications'}
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
				{'Standard'}
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
				{'Express'}
			</label>
			<select
				id="form-select"
				name="audience"
				value={audience}
				onChange={(event: Event) => setAudience((event.currentTarget as HTMLSelectElement).value)}
			>
				<option value="personal">{'Personal'}</option>
				<option value="team">{'Team'}</option>
			</select>
			<button
				id="form-conditional-toggle"
				type="button"
				onClick={() => setConditional((visible) => !visible)}
			>{'Toggle conditional section'}</button>
			@if (conditional) {
				<aside id="form-conditional">{'Conditional validation section'}</aside>
			}
			<button id="form-submit" type="submit">{'Send form'}</button>
			<button id="form-reset" type="button" onClick={reset}>{'Reset form'}</button>
		</form>

		<section aria-label="External store">
			<button
				id="store-toggle"
				type="button"
				onClick={() => setStoreVisible((visible) => !visible)}
			>{'Toggle store subscribers'}</button>
			<button
				id="store-narrow"
				type="button"
				onClick={() => store.writeOne(17, 1)}
			>{'Write one subscriber'}</button>
			<button
				id="store-broad"
				type="button"
				onClick={() => store.writeAll(7)}
			>{'Write all subscribers'}</button>
			<button
				id="store-rapid"
				type="button"
				onClick={() => {
					store.writeOne(17, 8);
					store.writeOne(17, 9);
					store.writeOne(17, 10);
				}}
			>{'Write rapid updates'}</button>
			@if (storeVisible) {
				<div id="store-subscribers">
					@for (const index of STORE_SUBSCRIBERS; key index) {
						<StoreSubscriber index={index} />
					}
				</div>
			}
		</section>
		<AsyncStatus />
	</main>
}
