import { gql } from '@apollo/client';
import { Suspense } from 'octane';
import {
	ApolloProvider,
	skipToken,
	useApolloClient,
	useFragment,
	useLazyQuery,
	useMutation,
	useQuery,
	useReactiveVar,
	useSubscription,
	useSuspenseQuery,
} from '@octanejs/apollo-client/react';
import { MockedProvider } from '@octanejs/apollo-client/testing/react';

export const GET_VALUE = gql`
	query GetValue {
		value
	}
`;

export const SAVE_VALUE = gql`
	mutation SaveValue($value: String!) {
		saveValue(value: $value)
	}
`;

export const GET_MOCKED_VALUE = gql`
	query GetMockedValue {
		mockedValue
	}
`;

export const GET_ITEM = gql`
	query GetItem($id: ID!) {
		item(id: $id) {
			id
			value
			__typename
		}
	}
`;

export const ITEM_FRAGMENT = gql`
	fragment ItemFields on Item {
		id
		value
		__typename
	}
`;

export const VALUE_SUBSCRIPTION = gql`
	subscription ValueChanged {
		valueChanged
	}
`;

function ClientPanel(props: {
	override: any;
	onClient: (client: any) => void;
	onOverride: (client: any) => void;
}) @{
	const client = useApolloClient();
	const override = useApolloClient(props.override);
	props.onClient(client);
	props.onOverride(override);
	<section id="client-panel">
		<output id="context-client">context</output>
		<output id="override-client">override</output>
	</section>
}

export function ProviderApp(props: {
	client: any;
	override: any;
	onClient: (client: any) => void;
	onOverride: (client: any) => void;
}) @{
	<ApolloProvider client={props.client}>
		<ClientPanel
			override={props.override}
			onClient={props.onClient}
			onOverride={props.onOverride}
		/>
	</ApolloProvider>
}

function QueryPanel() @{
	const result = useQuery(GET_VALUE);
	const value = (result.data as { value?: string } | undefined)?.value;
	<output id="query-result">
		{result.loading
			? 'loading'
			: result.error
				? 'error'
				: 'data:' + (value || '-')}
	</output>
}

export function QueryApp(props: { client: any }) @{
	<ApolloProvider client={props.client}>
		<QueryPanel />
	</ApolloProvider>
}

function SuspenseQueryPanel() @{
	const result = useSuspenseQuery(GET_VALUE, { fetchPolicy: 'network-only' });
	const value = (result.data as { value?: string } | undefined)?.value;
	<output id="suspense-query-result">{'data:' + (value || '-')}</output>
}

export function SuspenseQueryApp(props: { client: any }) @{
	<ApolloProvider client={props.client}>
		<Suspense fallback={<output id="suspense-query-fallback">pending</output>}>
			<SuspenseQueryPanel />
		</Suspense>
	</ApolloProvider>
}

function SkippedSuspenseQueryPanel() @{
	const result = useSuspenseQuery(GET_VALUE, skipToken);
	const value = (result.data as { value?: string } | undefined)?.value;
	<output id="skipped-suspense-query-result">{'data:' + (value || '-')}</output>
}

export function SkippedSuspenseQueryApp(props: { client: any }) @{
	<ApolloProvider client={props.client}>
		<Suspense fallback={<output id="skipped-suspense-query-fallback">pending</output>}>
			<SkippedSuspenseQueryPanel />
		</Suspense>
	</ApolloProvider>
}

function TwinQueryPanel() @{
	const first = useQuery(GET_ITEM, {
		variables: { id: 'first' },
		fetchPolicy: 'network-only',
	});
	const second = useQuery(GET_ITEM, {
		variables: { id: 'second' },
		fetchPolicy: 'network-only',
	});
	const firstValue = (first.data as { item?: { value?: string } } | undefined)?.item?.value;
	const secondValue = (second.data as { item?: { value?: string } } | undefined)?.item?.value;
	<section id="twin-query-panel">
		<output id="first-query-result">
			{first.loading
				? 'loading'
				: first.error
					? 'error'
					: 'data:' + (firstValue || '-')}
		</output>
		<output id="second-query-result">
			{second.loading
				? 'loading'
				: second.error
					? 'error'
					: 'data:' + (secondValue || '-')}
		</output>
	</section>
}

export function TwinQueryApp(props: { client: any }) @{
	<ApolloProvider client={props.client}>
		<TwinQueryPanel />
	</ApolloProvider>
}

function FragmentPanel(props: { from: any; onRender: () => void }) @{
	props.onRender();
	const result = useFragment({
		fragment: ITEM_FRAGMENT,
		from: props.from,
		optimistic: true,
	});
	const value = (result.data as { value?: string } | undefined)?.value;
	<output id="fragment-result">
		{result.complete ? 'complete:' + (value || '-') : 'partial:' + (value || '-')}
	</output>
}

export function FragmentApp(props: {
	client: any;
	from: any;
	onRender: () => void;
}) @{
	<ApolloProvider client={props.client}>
		<FragmentPanel from={props.from} onRender={props.onRender} />
	</ApolloProvider>
}

function MutationPanel() @{
	const [mutate, result] = useMutation(SAVE_VALUE);
	const value = (result.data as { saveValue?: string } | undefined)?.saveValue;
	<section id="mutation-panel">
		<output id="mutation-result">
			{result.loading
				? 'loading'
				: result.error
					? 'error'
					: result.called
						? 'data:' + (value || '-')
						: 'idle'}
		</output>
		<button
			id="mutate"
			onClick={() => {
				void mutate({ variables: { value: 'saved' } });
			}}
		>
			save
		</button>
	</section>
}

export function MutationApp(props: { client: any }) @{
	<ApolloProvider client={props.client}>
		<MutationPanel />
	</ApolloProvider>
}

export function ReactiveVarApp(props: { valueVar: any }) @{
	const value = useReactiveVar(props.valueVar);
	<section id="reactive-var-panel">
		<output id="reactive-var-value">{value}</output>
		<button id="update-var" onClick={() => props.valueVar('updated')}>update</button>
	</section>
}

function SubscriptionPanel() @{
	const result = useSubscription(VALUE_SUBSCRIPTION);
	const value = (result.data as { valueChanged?: string } | undefined)?.valueChanged;
	<output id="subscription-result">
		{result.loading
			? 'loading'
			: result.error
				? 'error'
				: 'data:' + (value || '-')}
	</output>
}

export function SubscriptionApp(props: { client: any }) @{
	<ApolloProvider client={props.client}>
		<SubscriptionPanel />
	</ApolloProvider>
}

function LazyQueryPanel(props: { executeDuringRender?: boolean }) @{
	const [execute, result] = useLazyQuery(GET_VALUE);
	if (props.executeDuringRender) {
		void execute();
	}
	const value = (result.data as { value?: string } | undefined)?.value;
	<section id="lazy-query-panel">
		<output id="lazy-query-result">
			{result.loading
				? 'loading'
				: result.error
					? 'error'
					: result.called
						? 'data:' + (value || '-')
						: 'idle'}
		</output>
		<button
			id="execute-lazy"
			onClick={() => {
				void execute();
			}}
		>
			load
		</button>
	</section>
}

export function LazyQueryApp(props: {
	client: any;
	executeDuringRender?: boolean;
}) @{
	<ApolloProvider client={props.client}>
		<LazyQueryPanel executeDuringRender={props.executeDuringRender} />
	</ApolloProvider>
}

function MockedQueryPanel(props: { label?: string }) @{
	const result = useQuery(GET_MOCKED_VALUE);
	const value = (result.data as { mockedValue?: string } | undefined)?.mockedValue;
	<section id="mocked-provider-panel">
		<output id="mocked-provider-label">{props.label || '-'}</output>
		<output id="mocked-provider-result">
			{result.loading
				? 'loading'
				: result.error
					? 'error'
					: 'data:' + (value || '-')}
		</output>
	</section>
}

export function MockedProviderApp(props: { mocks: unknown[] }) @{
	<MockedProvider
		mocks={props.mocks}
		mockLinkDefaultOptions={{ delay: 0 }}
		childProps={{ label: 'from-child-props' }}
		children={<MockedQueryPanel />}
	/>
}

export function MockedProviderBlockApp(props: { mocks: unknown[] }) @{
	<MockedProvider mocks={props.mocks} mockLinkDefaultOptions={{ delay: 0 }}>
		<MockedQueryPanel label="block-child" />
	</MockedProvider>
}
