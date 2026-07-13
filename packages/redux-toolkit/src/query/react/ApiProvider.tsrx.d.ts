import type { Context } from 'octane';
import type { ReactReduxContextValue } from '@octanejs/redux';
import type { Api, setupListeners } from '@reduxjs/toolkit/query';

export declare function ApiProvider(props: {
	children?: unknown;
	api: Api<any, {}, any, any>;
	setupListeners?: Parameters<typeof setupListeners>[1] | false;
	context?: Context<ReactReduxContextValue | null>;
}): unknown;
