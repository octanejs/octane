// Adapted from packages/wouter/upstream/canonical/test/location-hook.test-d.ts,
// link.test-d.tsx, route.test-d.tsx, and use-route.test-d.ts.
import type { LinkProps, Match, RouteProps, StringRouteParams } from '@octanejs/wouter';
import type { BrowserLocationHook } from '@octanejs/wouter/use-browser-location';
import type { Octane } from 'octane/jsx-runtime';

declare const browserHook: BrowserLocationHook;
const browserResult: ReturnType<BrowserLocationHook> = browserHook();
void browserResult;

const ref: Octane.Ref<HTMLAnchorElement> = { current: null };
const linkWithRef: LinkProps = { href: '/docs', ref, children: 'Docs' };
void linkWithRef;

// @ts-expect-error `to` and `href` are mutually exclusive.
const ambiguousLink: LinkProps = { href: '/a', to: '/b' };
void ambiguousLink;

const typedRoute: RouteProps<undefined, '/users/:id'> = {
	path: '/users/:id',
	children(params: StringRouteParams<'/users/:id'>) {
		const id: string | undefined = params.id;
		return id;
	},
};
void typedRoute;

const match: Match<StringRouteParams<'/users/:id'>> = [true, { 0: '42', id: '42' }];
void match;
