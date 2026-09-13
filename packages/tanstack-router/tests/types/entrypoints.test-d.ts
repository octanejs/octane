import * as PublicMain from '@octanejs/tanstack-router';
import * as PublicHistory from '@octanejs/tanstack-router/history';
import * as PublicServer from '@octanejs/tanstack-router/ssr/server';
import * as PublicClient from '@octanejs/tanstack-router/ssr/client';
import * as PublicGenerator from '@octanejs/tanstack-router/generator-plugin';
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions';
import { useCanGoBack } from '@octanejs/tanstack-router';
import { createMemoryHistory } from '@octanejs/tanstack-router/history';
import { renderRouterToString } from '@octanejs/tanstack-router/ssr/server';
import { RouterClient } from '@octanejs/tanstack-router/ssr/client';
import {
	maskOctaneRouteSource,
	octaneRouteGeneratorPlugin,
} from '@octanejs/tanstack-router/generator-plugin';

type BackAvailability = Assert<Equal<ReturnType<typeof useCanGoBack>, boolean>>;
type HistoryPath = Assert<
	Equal<ReturnType<typeof createMemoryHistory>['location']['pathname'], string>
>;
type ServerResponse = Assert<Equal<ReturnType<typeof renderRouterToString>, Promise<Response>>>;
type ClientRouterStatus = Assert<
	Equal<Parameters<typeof RouterClient>[0]['router']['state']['status'], 'pending' | 'idle'>
>;
type MaskedSource = Assert<Equal<ReturnType<typeof maskOctaneRouteSource>, string>>;
type GeneratorName = Assert<Equal<ReturnType<typeof octaneRouteGeneratorPlugin>['name'], string>>;

// @ts-expect-error History entries are URLs, not numeric indices.
createMemoryHistory({ initialEntries: [42] });
// @ts-expect-error The generator accepts authored text.
maskOctaneRouteSource(42);
// @ts-expect-error Server rendering needs the router, response headers and application component.
renderRouterToString({});

const nativeRoot = PublicMain.createRootRoute();
const nativeRoute = PublicMain.createRoute({
	getParentRoute: () => nativeRoot,
	path: '/items/$itemId',
	ssr: false,
});
type NativeRouteSsr = Assert<Equal<typeof nativeRoute.types.ssr, false>>;
type NativeRouteParamNames = Assert<Equal<keyof typeof nativeRoute.types.params, 'itemId'>>;
type NativeRouteParamValue = Assert<Equal<typeof nativeRoute.types.params.itemId, string>>;

const pathname = PublicMain.useLocation({ select: (location) => location.pathname }, Symbol());
type SelectedLocation = Assert<Equal<typeof pathname, string>>;
// @ts-expect-error A compiler slot must not widen a selected pathname to any.
const invalidSelectedLocation: number = pathname;
// @ts-expect-error A compiler slot does not permit an invalid option.
PublicMain.useLocation({ select: 123 }, Symbol());

PublicMain.Await({
	promise: Promise.resolve({ title: 'Ready' }),
	children: (value) => {
		type AwaitedTitle = Assert<Equal<typeof value.title, string>>;
		// @ts-expect-error Await infers the resolved payload, including absent fields.
		value.missing;
		return value.title;
	},
});

const scroll = PublicMain.useElementScrollRestoration({ id: 'item-list' });
// @ts-expect-error Scroll entries do not become an arbitrary string.
const invalidScroll: string = scroll;
