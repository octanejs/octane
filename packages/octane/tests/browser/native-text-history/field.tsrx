import type { WritableSignal } from 'octane/signals';
import 'octane/signals';

export interface FieldProps {
	draft$: WritableSignal<string>;
	tag: 'input' | 'textarea';
	spread: boolean;
}

export function Field({ draft$, tag, spread }: FieldProps) @{
	<form>
		@if (tag === 'input') {
			@if (spread) {
				<input aria-label="Draft" {...{ value: draft$ }} />
			} @else {
				<input aria-label="Draft" value={draft$} />
			}
		} @else {
			@if (spread) {
				<textarea aria-label="Draft" {...{ value: draft$ }} />
			} @else {
				<textarea aria-label="Draft" value={draft$} />
			}
		}
	</form>
}
