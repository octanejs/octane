import useSWRImmutable from '../../../src/immutable/index';
import useSWRInfinite from '../../../src/infinite/index';
import useSWRMutation from '../../../src/mutation/index';
import useSWRSubscription from '../../../src/subscription/index';

export const controls: Record<string, any> = {};

export function ImmutableReader(props) @{
	const state = useSWRImmutable(props.cacheKey, props.fetcher, props.config);
	<output data-testid="immutable">{JSON.stringify({
		data: state.data,
		isValidating: state.isValidating,
	})}</output>
}

export function InfiniteReader(props) @{
	const state = useSWRInfinite(props.getKey, props.fetcher, props.config);
	controls.setSize = state.setSize;
	controls.mutateInfinite = state.mutate;
	<output data-testid="infinite">{JSON.stringify({
		data: state.data,
		size: state.size,
		error: state.error?.message,
	})}</output>
}

export function MutationReader(props) @{
	const state = useSWRMutation(props.cacheKey, props.fetcher, props.config);
	controls.trigger = state.trigger;
	controls.reset = state.reset;
	<output data-testid="mutation">{JSON.stringify({
		data: state.data,
		error: state.error?.message,
		isMutating: state.isMutating,
	})}</output>
}

export function SubscriptionReader(props) @{
	const state = useSWRSubscription(props.cacheKey, props.subscribe, props.config);
	<output data-testid={props.id || 'subscription'}>{JSON.stringify({
		data: state.data,
		error: state.error?.message,
	})}</output>
}

export function SubscriptionSiblings(props) @{
	<div>
		<SubscriptionReader id="subscription-first" {...props} />
		<SubscriptionReader id="subscription-second" {...props} />
	</div>
}
