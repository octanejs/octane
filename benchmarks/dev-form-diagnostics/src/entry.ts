import { flushSync, setValue } from 'octane';

export interface DiagnosticBatch {
	commit(): { count: number; revision: number; sampledValuesMatch: boolean };
	validate(): { count: number; revision: number; valuesMatch: boolean };
	dispose(): void;
}

export function createDiagnosticBatch(count: number): DiagnosticBatch {
	const container = document.createElement('section');
	const inputs: HTMLInputElement[] = [];
	for (let index = 0; index < count; index++) {
		const input = document.createElement('input');
		input.readOnly = true;
		(input as HTMLInputElement & { __oct_loc: string }).__oct_loc =
			'benchmarks/dev-form-diagnostics/src/entry.ts:controlled-input';
		container.appendChild(input);
		inputs.push(input);
	}
	document.body.appendChild(container);

	let revision = 0;
	return {
		commit() {
			revision++;
			const value = String(revision);
			flushSync(() => {
				for (let index = 0; index < inputs.length; index++) setValue(inputs[index], value);
			});
			return {
				count: inputs.length,
				revision,
				sampledValuesMatch:
					inputs[0]?.value === value &&
					inputs[inputs.length >> 1]?.value === value &&
					inputs[inputs.length - 1]?.value === value,
			};
		},
		validate() {
			const value = String(revision);
			return {
				count: inputs.length,
				revision,
				valuesMatch: inputs.every((input) => input.value === value),
			};
		},
		dispose() {
			container.remove();
		},
	};
}
