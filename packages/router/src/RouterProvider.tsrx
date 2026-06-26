// Places the router into context and renders the active match tree. Mirrors
// react-router's RouterProvider (RouterContextProvider + <Matches/>).
import { routerContext } from './context.ts';
import { Matches } from './Matches.tsrx';

export function RouterProvider(props) @{
	<routerContext.Provider value={props.router}>
		<Matches />
	</routerContext.Provider>
}
