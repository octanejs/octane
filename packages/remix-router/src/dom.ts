// `@octanejs/remix-router/dom` — mirror of upstream `react-router/dom`
// (dom-export.ts): the RouterProvider variant with flushSync wired in.
// Upstream needs the react-dom split for this; octane is one package, so
// this simply binds octane's flushSync.
import { createElement, flushSync } from 'octane';
import { RouterProvider as BaseRouterProvider } from './lib/components/RouterProvider.tsrx';
import type { Router as DataRouter } from './lib/router/router';
import type { ClientOnErrorFunction } from './lib/context';

export function RouterProvider(props: {
	router: DataRouter;
	onError?: ClientOnErrorFunction;
	useTransitions?: boolean;
}) {
	return createElement(BaseRouterProvider as any, { flushSync, ...props });
}
