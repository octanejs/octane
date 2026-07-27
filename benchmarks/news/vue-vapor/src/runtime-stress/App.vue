<script setup vapor lang="ts">
import { onMounted, onUnmounted, shallowRef } from 'vue';
import {
	FORM_FIELDS,
	LIFECYCLE_ROWS,
	STORE_SUBSCRIBERS,
	getRuntimeStress,
	recordSubmission,
} from '../../../../runtime-stress/shared.js';
import FormField from './FormField.vue';
import LifecycleRow from './LifecycleRow.vue';
import StoreSubscriber from './StoreSubscriber.vue';

const lifecycleVisible = shallowRef(false);
const lifecycleTick = shallowRef(0);
const storeVisible = shallowRef(false);
const resetVersion = shallowRef(0);
const notifications = shallowRef(false);
const delivery = shallowRef('standard');
const audience = shallowRef('personal');
const conditional = shallowRef(false);
const store = getRuntimeStress().store;
const asyncResource = getRuntimeStress().async;
const asyncSnapshot = shallowRef(asyncResource.getSnapshot());
let unsubscribeAsync: (() => void) | undefined;

onMounted(() => {
	unsubscribeAsync = asyncResource.subscribe(() => {
		asyncSnapshot.value = asyncResource.getSnapshot();
	});
});

onUnmounted(() => unsubscribeAsync?.());

function reset() {
	resetVersion.value++;
	notifications.value = false;
	delivery.value = 'standard';
	audience.value = 'personal';
	conditional.value = false;
}

function onCheckbox(event: Event) {
	notifications.value = (event.currentTarget as HTMLInputElement).checked;
}

function onAudience(event: Event) {
	audience.value = (event.currentTarget as HTMLSelectElement).value;
}

function writeRapid() {
	store.writeOne(17, 8);
	store.writeOne(17, 9);
	store.writeOne(17, 10);
}
</script>

<template>
	<main>
		<section aria-label="Lifecycle soak">
			<button id="lifecycle-toggle" type="button" @click="lifecycleVisible = !lifecycleVisible">
				Toggle lifecycle rows
			</button>
			<button id="lifecycle-update" type="button" @click="lifecycleTick++">
				Update lifecycle rows
			</button>
			<ul v-if="lifecycleVisible">
				<LifecycleRow
					v-for="index of LIFECYCLE_ROWS"
					:key="index"
					:index="index"
					:tick="lifecycleTick"
				/>
			</ul>
		</section>

		<form id="stress-form" @submit="recordSubmission">
			<FormField v-for="index of FORM_FIELDS" :key="`${resetVersion}:${index}`" :index="index" />
			<label>
				<input
					id="form-checkbox"
					type="checkbox"
					name="notifications"
					value="enabled"
					:checked="notifications"
					@change="onCheckbox"
				/>
				Notifications
			</label>
			<label>
				<input
					id="form-radio-standard"
					type="radio"
					name="delivery"
					value="standard"
					:checked="delivery === 'standard'"
					@change="delivery = 'standard'"
				/>
				Standard
			</label>
			<label>
				<input
					id="form-radio-express"
					type="radio"
					name="delivery"
					value="express"
					:checked="delivery === 'express'"
					@change="delivery = 'express'"
				/>
				Express
			</label>
			<select id="form-select" name="audience" :value="audience" @change="onAudience">
				<option value="personal">Personal</option>
				<option value="team">Team</option>
			</select>
			<button id="form-conditional-toggle" type="button" @click="conditional = !conditional">
				Toggle conditional section
			</button>
			<aside v-if="conditional" id="form-conditional">Conditional validation section</aside>
			<button id="form-submit" type="submit">Send form</button>
			<button id="form-reset" type="button" @click="reset">Reset form</button>
		</form>

		<section aria-label="External store">
			<button id="store-toggle" type="button" @click="storeVisible = !storeVisible">
				Toggle store subscribers
			</button>
			<button id="store-narrow" type="button" @click="store.writeOne(17, 1)">
				Write one subscriber
			</button>
			<button id="store-broad" type="button" @click="store.writeAll(7)">
				Write all subscribers
			</button>
			<button id="store-rapid" type="button" @click="writeRapid">Write rapid updates</button>
			<div v-if="storeVisible" id="store-subscribers">
				<StoreSubscriber v-for="index of STORE_SUBSCRIBERS" :key="index" :index="index" />
			</div>
		</section>

		<section aria-label="Async recovery">
			<button id="async-resolve" type="button" @click="asyncResource.run('resolve')">
				Resolve request
			</button>
			<button id="async-reject" type="button" @click="asyncResource.run('reject')">
				Reject request
			</button>
			<button id="async-slow" type="button" @click="asyncResource.run('slow', 'stale')">
				Start slow request
			</button>
			<output id="async-status">{{ asyncSnapshot.status }}</output>
			<output id="async-value">{{ asyncSnapshot.value }}</output>
			<output id="async-error">{{ asyncSnapshot.error }}</output>
		</section>
	</main>
</template>
