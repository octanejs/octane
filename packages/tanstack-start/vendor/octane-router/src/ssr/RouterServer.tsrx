import { RouterProvider } from '../RouterProvider.tsrx';
import type { AnyRouter } from '@tanstack/router-core';

export function RouterServer(props: { router: AnyRouter }) @{
	<RouterProvider router={props.router} />
}
