import { body$, draft$, history$, selectedDay$ } from './State.ts';

// This physically separate production chunk must reuse the original state/engine chunk.
export function inspect() {
	return {
		draft: draft$.get(),
		selectedDay: selectedDay$.get(),
		body: body$.get(),
		history: history$.get(),
	};
}
