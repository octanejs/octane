import type { ApolloClient, TypedDocumentNode } from '@octanejs/apollo-client';
import {
	createQueryPreloader,
	skipToken,
	useBackgroundQuery,
	useMutation,
	useQuery,
	useReadQuery,
} from '@octanejs/apollo-client/react';
import type { QueryRef } from '@octanejs/apollo-client/react/internal';
import { MockedProvider, type MockedProviderProps } from '@octanejs/apollo-client/testing/react';
import type { ElementDescriptor } from 'octane';

declare function expectType<T>(value: T): void;

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

interface UserQueryData {
	user: {
		id: string;
		name: string;
	} | null;
}

interface UserQueryVariables {
	id: string;
}

interface RenameUserData {
	renameUser: {
		id: string;
		name: string;
	};
}

interface RenameUserVariables {
	id: string;
	name: string;
}

declare const userQuery: TypedDocumentNode<UserQueryData, UserQueryVariables>;
declare const renameUserMutation: TypedDocumentNode<RenameUserData, RenameUserVariables>;
declare const client: ApolloClient;
declare const child: ElementDescriptor;

const queryResult = useQuery(userQuery, {
	variables: { id: 'user-1' },
});
type _queryData = Expect<Equal<typeof queryResult.data, UserQueryData | undefined>>;
expectType<string | undefined>(queryResult.data?.user?.name);
expectType<UserQueryVariables>(queryResult.variables);

// @ts-expect-error required variables must be supplied for a typed query
useQuery(userQuery);
// @ts-expect-error `id` is required
useQuery(userQuery, { variables: {} });
// @ts-expect-error `id` has the wrong scalar type
useQuery(userQuery, { variables: { id: 123 } });
// @ts-expect-error unknown variables are rejected
useQuery(userQuery, { variables: { id: 'user-1', extra: true } });

const skippedQueryResult = useQuery(userQuery, skipToken);
expectType<UserQueryData | undefined>(skippedQueryResult.data);

const [renameUser, mutationResult] = useMutation(renameUserMutation);
type _mutationData = Expect<Equal<typeof mutationResult.data, RenameUserData | null | undefined>>;

const mutationPromise = renameUser({
	variables: { id: 'user-1', name: 'Grace' },
});
mutationPromise.then((result) => {
	expectType<RenameUserData | undefined>(result.data);
});

// @ts-expect-error `name` is required
renameUser({ variables: { id: 'user-1' } });
// @ts-expect-error `id` has the wrong scalar type
renameUser({ variables: { id: 123, name: 'Grace' } });
// @ts-expect-error unknown variables are rejected
renameUser({ variables: { id: 'user-1', name: 'Grace', extra: true } });

const [queryRef] = useBackgroundQuery(userQuery, {
	variables: { id: 'user-1' },
});
expectType<QueryRef<UserQueryData, UserQueryVariables>>(queryRef);
const backgroundResult = useReadQuery(queryRef);
expectType<UserQueryData>(backgroundResult.data);

const [skippedQueryRef] = useBackgroundQuery(userQuery, skipToken);
expectType<undefined>(skippedQueryRef);

const preloadQuery = createQueryPreloader(client);
const preloadedQueryRef = preloadQuery(userQuery, {
	variables: { id: 'user-1' },
});
expectType<QueryRef<UserQueryData, UserQueryVariables>>(preloadedQueryRef);
expectType<UserQueryData>(useReadQuery(preloadedQueryRef).data);

// @ts-expect-error required preloader variables must be supplied
preloadQuery(userQuery);
// @ts-expect-error preloader variable types are inferred from TypedDocumentNode
preloadQuery(userQuery, { variables: { id: 123 } });

const mockedProviderProps: MockedProviderProps = {
	children: child,
	mocks: [
		{
			request: {
				query: userQuery,
				variables: { id: 'user-1' },
			},
			result: {
				data: {
					user: { id: 'user-1', name: 'Ada' },
				},
			},
		},
	],
	showWarnings: false,
	childProps: { role: 'main' },
};
expectType<MockedProviderProps>(mockedProviderProps);
expectType<MockedProviderProps>({} as Parameters<typeof MockedProvider>[0]);
