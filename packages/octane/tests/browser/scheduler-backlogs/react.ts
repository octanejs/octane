import {
	createElement as h,
	startTransition,
	useActionState,
	useLayoutEffect,
	useState,
	type FormEvent,
} from 'react';
import { createRoot } from 'react-dom/client';
import { burn, commit, count, input, observe, state } from './shared.js';
function Draft({ start }: { start: () => void }) {
	const [draft, setDraft] = useState('');
	return h(
		'section',
		null,
		h('input', {
			id: 'draft',
			value: draft,
			onInput: (event: FormEvent<HTMLInputElement>) => setDraft(input(event.nativeEvent, start)),
		}),
		h('output', { id: 'draft-output' }, draft),
	);
}
function App() {
	const [value, dispatch, pending] = useActionState((previous: number) => {
		observe(previous + 1);
		return previous + 1;
	}, 0);
	useLayoutEffect(() => commit(value, pending));
	if (state.startedAt) burn(2);
	return h(
		'main',
		null,
		h(Draft, {
			start: () =>
				startTransition(() => {
					for (let i = 0; i < count; i++) dispatch();
				}),
		}),
		h('output', { id: 'result' }, String(value)),
		h('span', { id: 'pending' }, String(pending)),
	);
}
createRoot(document.querySelector('#root')!).render(h(App));
