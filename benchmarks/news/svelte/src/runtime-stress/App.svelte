<script>
	import {
		FORM_FIELDS,
		LIFECYCLE_ROWS,
		STORE_SUBSCRIBERS,
		getRuntimeStress,
		recordSubmission,
	} from '../../../../runtime-stress/shared.js';
	import FormField from './FormField.svelte';
	import LifecycleRow from './LifecycleRow.svelte';
	import StoreSubscriber from './StoreSubscriber.svelte';

	let lifecycleVisible = $state(false);
	let lifecycleTick = $state(0);
	let storeVisible = $state(false);
	let resetVersion = $state(0);
	let notifications = $state(false);
	let delivery = $state('standard');
	let audience = $state('personal');
	let conditional = $state(false);
	const store = getRuntimeStress().store;
	const asyncResource = getRuntimeStress().async;
	let asyncSnapshot = $state(asyncResource.getSnapshot());

	$effect(() => asyncResource.subscribe(() => (asyncSnapshot = asyncResource.getSnapshot())));

	function reset() {
		resetVersion++;
		notifications = false;
		delivery = 'standard';
		audience = 'personal';
		conditional = false;
	}
</script>

<main>
	<section aria-label="Lifecycle soak">
		<button
			id="lifecycle-toggle"
			type="button"
			onclick={() => (lifecycleVisible = !lifecycleVisible)}
		>
			Toggle lifecycle rows
		</button>
		<button id="lifecycle-update" type="button" onclick={() => lifecycleTick++}>
			Update lifecycle rows
		</button>
		{#if lifecycleVisible}
			<ul>
				{#each LIFECYCLE_ROWS as index (index)}
					<LifecycleRow {index} tick={lifecycleTick} />
				{/each}
			</ul>
		{/if}
	</section>

	<form id="stress-form" onsubmit={recordSubmission}>
		{#each FORM_FIELDS as index (`${resetVersion}:${index}`)}
			<FormField {index} />
		{/each}
		<label>
			<input
				id="form-checkbox"
				type="checkbox"
				name="notifications"
				value="enabled"
				checked={notifications}
				onchange={(event) => (notifications = event.currentTarget.checked)}
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
				onchange={() => (delivery = 'standard')}
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
				onchange={() => (delivery = 'express')}
			/>
			Express
		</label>
		<select
			id="form-select"
			name="audience"
			value={audience}
			onchange={(event) => (audience = event.currentTarget.value)}
		>
			<option value="personal">Personal</option>
			<option value="team">Team</option>
		</select>
		<button id="form-conditional-toggle" type="button" onclick={() => (conditional = !conditional)}>
			Toggle conditional section
		</button>
		{#if conditional}
			<aside id="form-conditional">Conditional validation section</aside>
		{/if}
		<button id="form-submit" type="submit">Send form</button>
		<button id="form-reset" type="button" onclick={reset}>Reset form</button>
	</form>

	<section aria-label="External store">
		<button id="store-toggle" type="button" onclick={() => (storeVisible = !storeVisible)}>
			Toggle store subscribers
		</button>
		<button id="store-narrow" type="button" onclick={() => store.writeOne(17, 1)}>
			Write one subscriber
		</button>
		<button id="store-broad" type="button" onclick={() => store.writeAll(7)}>
			Write all subscribers
		</button>
		<button
			id="store-rapid"
			type="button"
			onclick={() => {
				store.writeOne(17, 8);
				store.writeOne(17, 9);
				store.writeOne(17, 10);
			}}
		>
			Write rapid updates
		</button>
		{#if storeVisible}
			<div id="store-subscribers">
				{#each STORE_SUBSCRIBERS as index (index)}
					<StoreSubscriber {index} />
				{/each}
			</div>
		{/if}
	</section>

	<section aria-label="Async recovery">
		<button id="async-resolve" type="button" onclick={() => asyncResource.run('resolve')}>
			Resolve request
		</button>
		<button id="async-reject" type="button" onclick={() => asyncResource.run('reject')}>
			Reject request
		</button>
		<button id="async-slow" type="button" onclick={() => asyncResource.run('slow', 'stale')}>
			Start slow request
		</button>
		<output id="async-status">{asyncSnapshot.status}</output>
		<output id="async-value">{asyncSnapshot.value}</output>
		<output id="async-error">{asyncSnapshot.error}</output>
	</section>
</main>
