import {
	createElement as h,
	startTransition,
	useActionState,
	useLayoutEffect,
	useState,
	useEffect,
	useDeferredValue,
	memo,
	type FormEvent,
} from 'react';
import { createRoot } from 'react-dom/client';
import {
	burn,
	commit,
	completeSource,
	cold,
	blocked,
	count,
	effect,
	input,
	observe,
	scenario,
	state,
	task,
	workMs,
} from './shared.js';
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
		const finish = () => {
			observe(previous + 1);
			if (previous + 1 === count) completeSource();
			return previous + 1;
		};
		return cold || (blocked && previous === 0) ? task().then(finish) : finish();
	}, 0);
	useLayoutEffect(() => commit(value, pending));
	useEffect(effect);
	if (state.startedAt) burn(workMs);
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
const Slow = memo(function Slow({ value }: { value: number }) {
	if (value) burn(workMs * count);
	useLayoutEffect(() => {
		if (value) {
			observe(value);
			completeSource();
		}
		commit(value);
	});
	useEffect(effect);
	return h('output', { id: 'result' }, String(value));
});
function Deferred() {
	const [value, setValue] = useState(0);
	const deferred = useDeferredValue(value);
	return h(
		'main',
		null,
		h(Draft, {
			start: () => {
				void (cold ? task() : Promise.resolve()).then(() => setValue(count));
			},
		}),
		h(Slow, { value: deferred }),
	);
}
const root = createRoot(document.querySelector('#root')!);
root.render(h(scenario === 'deferred' ? Deferred : App));
window.__schedulerDispose = () => root.unmount();
state.readyAt = performance.now();
