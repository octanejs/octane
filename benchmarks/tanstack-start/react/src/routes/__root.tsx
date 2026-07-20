/// <reference types="vite/client" />
import * as React from 'react';
import { HeadContent, Link, Outlet, Scripts, createRootRoute } from '@tanstack/react-router';

import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary';
import { NotFound } from '~/components/NotFound';
import '~/styles/app.css';
import { seo } from '~/utils/seo';

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
	errorComponent: (props) => {
		return (
			<RootDocument>
				<DefaultCatchBoundary {...props} />
			</RootDocument>
		);
	},
	notFoundComponent: () => <NotFound />,
	component: RootComponent,
});

function RootComponent() {
	return (
		<RootDocument>
			<Outlet />
		</RootDocument>
	);
}

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<nav className="p-2 flex gap-2 text-lg" data-testid="root-nav">
					<Link to="/" activeProps={{ className: 'font-bold' }} activeOptions={{ exact: true }}>
						Home
					</Link>
					<Link to="/posts" activeProps={{ className: 'font-bold' }}>
						Posts
					</Link>
					<Link to="/deferred" activeProps={{ className: 'font-bold' }}>
						Deferred
					</Link>
				</nav>
				<hr />
				{children}
				<Scripts />
			</body>
		</html>
	);
}
