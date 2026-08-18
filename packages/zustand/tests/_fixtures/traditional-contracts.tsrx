import { useState } from 'octane';
import { createStore } from '@octanejs/zustand/vanilla';
import type { StoreApi } from '@octanejs/zustand/vanilla';
import { useStoreWithEqualityFn } from '@octanejs/zustand/traditional';

export type SelectionState = { first: number; second: number };
type Selection = { value: number };
type ReadableStore = Pick<StoreApi<SelectionState>, 'getState' | 'getInitialState' | 'subscribe'>;
type Selector = (state: SelectionState) => Selection;
type EqualityFn = (previous: Selection, next: Selection) => boolean;

export const selectFirst: Selector = (state) => ({ value: state.first });
export const selectSecond: Selector = (state) => ({ value: state.second });
export const equalSelection: EqualityFn = (previous, next) => previous.value === next.value;
export const keepSelection: EqualityFn = () => true;

export function SelectionReader(props: {
	api: ReadableStore;
	selector: Selector;
	equalityFn: EqualityFn;
	generation?: number;
}) @{
	const selection = useStoreWithEqualityFn(props.api, props.selector, props.equalityFn);
	<output id="selection" data-generation={String(props.generation ?? 0)}>{String(
		selection.value,
	) as string}</output>
}

type ErrorState = { value: string | number };
type ErrorStore = StoreApi<ErrorState>;

function selectText(state: ErrorState): string {
	if (typeof state.value !== 'string') throw new Error('selector requires text');
	return state.value.toUpperCase();
}

function selectErrorState(state: ErrorState): ErrorState {
	return state;
}

function equalText(previous: ErrorState, next: ErrorState): boolean {
	if (typeof next.value !== 'string') throw new Error('equality requires text');
	return previous.value === next.value;
}

function SelectorErrorReader(props: { api: ErrorStore }) @{
	const value = useStoreWithEqualityFn(props.api, selectText);
	<output id="error-value">{value as string}</output>
}

function EqualityErrorReader(props: { api: ErrorStore }) @{
	const value = useStoreWithEqualityFn(props.api, selectErrorState, equalText);
	<output id="error-value">{String(value.value) as string}</output>
}

export function TraditionalErrors(props: { kind: 'selector' | 'equality' }) @{
	const [api] = useState(() => createStore<ErrorState>(() => ({ value: 'ready' })));
	const Reader =
		props.kind === 'selector' ? SelectorErrorReader : EqualityErrorReader;

	<section>
		<button id="break-selection" onClick={() => api.setState({ value: 1 })}>break</button>
		<button id="repair-selection" onClick={() => api.setState({ value: 'recovered' })}>
			repair
		</button>
		@try {
			<Reader api={api} />
		} @catch (error, reset) {
			<div>
				<output id="selection-error">{String(error) as string}</output>
				<button id="retry-selection" onClick={() => reset()}>retry</button>
			</div>
		}
	</section>
}
