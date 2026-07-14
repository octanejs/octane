import type { ApolloClient } from '@apollo/client';
import type { ApolloCache } from '@apollo/client/cache';
import type { ApolloLink } from '@apollo/client/link';
import type { LocalState } from '@apollo/client/local-state';
import type { MockLink } from '@apollo/client/testing';
import type { ComponentBody } from 'octane';

export interface MockedProviderProps {
	mocks?: ReadonlyArray<MockLink.MockedResponse<any, any>>;
	defaultOptions?: ApolloClient.DefaultOptions;
	cache?: ApolloCache;
	localState?: LocalState;
	childProps?: object;
	children?: unknown;
	link?: ApolloLink;
	showWarnings?: boolean;
	mockLinkDefaultOptions?: MockLink.DefaultOptions;
	devtools?: ApolloClient.Options['devtools'];
}

export declare const MockedProvider: ComponentBody<MockedProviderProps>;
