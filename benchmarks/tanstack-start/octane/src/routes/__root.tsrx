import {
	Body,
	Head,
	HeadContent,
	Html,
	Link,
	Outlet,
	Scripts,
	createRootRoute,
} from '@tanstack/octane-router';
import { DefaultCatchBoundary } from '../components/DefaultCatchBoundary.tsrx';
import { NotFound } from '../components/NotFound.tsrx';
import { seo } from '../utils/seo.ts';
import '../styles/app.css';

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: 'utf-8' },
			{ name: 'viewport', content: 'width=device-width, initial-scale=1' },
			...seo({
				title: 'TanStack Start Bench',
				description: 'The same Start application, served by two frameworks.',
			}),
		],
	}),
	shellComponent: RootDocument,
	component: RootLayout,
	errorComponent: DefaultCatchBoundary,
	notFoundComponent: NotFound,
});

function RootDocument(props: { children?: unknown }) @{
	<Html lang="en">
		<Head>
			<HeadContent />
		</Head>
		<Body>
			{props.children}
			<Scripts />
		</Body>
	</Html>
}

function RootLayout() @{
	<>
		<nav class="p-2 flex gap-2 text-lg" data-testid="root-nav">
			<Link to="/" activeProps={{ class: 'font-bold' }} activeOptions={{ exact: true }}>
				Home
			</Link>
			<Link to="/posts" activeProps={{ class: 'font-bold' }}>
				Posts
			</Link>
			<Link to="/deferred" activeProps={{ class: 'font-bold' }}>
				Deferred
			</Link>
		</nav>
		<hr />
		<Outlet />
	</>
}
