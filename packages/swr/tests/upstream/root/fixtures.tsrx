import useSWR, { SWRConfig } from '../../../src/index/index';
import { Suspense } from 'octane';

export const captured: { mutate?: (...args: any[]) => any } = {};
export const renderTrace: unknown[] = [];

export function SWRReader(props) @{
	const state = useSWR(props.cacheKey, props.fetcher, props.config);
	captured.mutate = state.mutate;
	renderTrace.push({
		data: state.data,
		error: state.error?.message,
		isLoading: state.isLoading,
		isValidating: state.isValidating,
	});
	<output data-testid={props.id || 'value'}>{JSON.stringify({
		data: state.data,
		error: state.error?.message,
		isLoading: state.isLoading,
		isValidating: state.isValidating,
	})}</output>
}

export function SWRSiblings(props) @{
	<div>
		<SWRReader id="first" cacheKey={props.cacheKey} fetcher={props.fetcher} config={props.config} />
		<SWRReader
			id="second"
			cacheKey={props.cacheKey}
			fetcher={props.fetcher}
			config={props.config}
		/>
	</div>
}

export function SWRSuspense(props) @{
	<Suspense fallback={<span data-testid="fallback">loading</span>}>
		<SWRReader cacheKey={props.cacheKey} fetcher={props.fetcher} config={{ suspense: true }} />
	</Suspense>
}

export function SWRProviderProbe(props) @{
	<SWRConfig value={{ provider: props.provider }}>
		<output data-testid="provider">configured</output>
	</SWRConfig>
}
