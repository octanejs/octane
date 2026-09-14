import { createRoot } from 'octane';
import type { UseFormReturn } from '@octanejs/hook-form';
import { ReleaseForm, type ReleaseValues } from '../_fixtures/release-contracts.tsrx';

let methods: UseFormReturn<ReleaseValues>;
let reject = false;
const values: string[] = [];
const submissions: { name: string; fileName: string; fileText: string; nativeFile: boolean }[] = [];
let payloads = 0;
const root = createRoot(document.getElementById('root')!);
root.render(ReleaseForm, {
	onReady: (next: UseFormReturn<ReleaseValues>) => {
		methods = next;
	},
	onValue: (name: string) => values.push(name),
	onPayload: () => {
		payloads++;
	},
	action: async (data: FormData) => {
		if (reject) throw new Error('Submission failed');
		const file = data.get('attachment');
		submissions.push({
			name: String(data.get('name')),
			fileName: file instanceof File ? file.name : '',
			fileText: file instanceof File ? await file.text() : '',
			nativeFile: file instanceof File,
		});
	},
});

const harness = {
	ready: () => Boolean(methods),
	snapshot: () => ({
		values: [...values],
		submissions: [...submissions],
		payloads,
		serverError: methods.getErrors('root.server')?.type ?? null,
	}),
	attach: () =>
		methods.setValue(
			'attachment',
			new File(['retained bytes'], 'evidence.txt', { type: 'text/plain' }),
		),
	reject: () => {
		reject = true;
	},
	unmount: () => root.unmount(),
	setAfterUnmount: () => methods.setValue('name', 'detached'),
};
declare global {
	interface Window {
		hookFormBrowser: typeof harness;
	}
}
window.hookFormBrowser = harness;
