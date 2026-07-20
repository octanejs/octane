import { createElement } from 'octane/server';
import { RouterProvider } from '@octanejs/tanstack-router';

export function StartServer({ router }) {
	return createElement(RouterProvider, { router });
}
