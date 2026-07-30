import { bind, Subscribe } from '@octanejs/rxjs';
import { useState } from 'octane';
import type { Observable } from 'rxjs';

export const [useValue] = bind((source: Observable<number>) => source, -1);

export function Reader(props: { source: Observable<number> }) @{
	const value = useValue(props.source);
	<output id="value">{value as any}</output>
}

export function SubscribeReader(props: { source: Observable<number> }) @{
	<Subscribe source$={props.source} fallback={<span id="fallback">{'loading'}</span>}>
		<Reader source={props.source} />
	</Subscribe>
}

export function SourceSubscriber(props: { source: Observable<unknown> }) @{
	<Subscribe source$={props.source}>
		<span id="subscribed">{'subscribed'}</span>
	</Subscribe>
}

export function StableSubscriptionReader(props: { source: Observable<number> }) @{
	const value = useValue(props.source);
	const [renders, setRenders] = useState(0);
	<>
		<output id="stable-value">{value as any}</output>
		<button id="rerender" onClick={() => setRenders(renders + 1)}>{renders as any}</button>
	</>
}

export function ObservableErrorBoundary(props: { source: Observable<number> }) @{
	@try {
		<Reader source={props.source} />
	} @catch (error) {
		<output id="observable-error">{(error as Error).message as string}</output>
	}
}
