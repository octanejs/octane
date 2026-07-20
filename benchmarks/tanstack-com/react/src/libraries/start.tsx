import { Network, Rocket, ServerCrash } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { redirect } from '@tanstack/react-router';
import { YinYangIcon } from '~/components/icons/YinYangIcon';
import { start } from './libraries';

const textStyles = 'text-cyan-600 dark:text-cyan-500';

export const startProject = {
	...start,
	description: `Full-document SSR, Streaming, Server Functions, bundling and more, powered by TanStack Router and Vite - Ready to deploy to your favorite hosting provider.`,
	latestBranch: 'main',
	docsRoot: 'docs/start',
	bgRadial: 'from-cyan-500 via-teal-600/50 to-transparent',
	textColor: 'text-cyan-600',
	embedEditor: 'codesandbox' as const,
	defaultDocs: 'framework/react/overview',
	installPath: 'framework/$framework/build-from-scratch',
	showNetlifyUrl: true,
	showCloudflareUrl: true,
	showRailwayUrl: true,
	// hide stackblitz until they support Async Local Storage
	hideStackblitzUrl: true as const,
	testimonials: [
		{
			quote:
				"I've been using Tanstack Start for a new project and it's super good. The server functions completely replace the need for TRPC/GraphQL/REST.",
			author: 'Developer',
			role: 'TanStack Community',
			company: '',
		},
		{
			quote:
				'I just love how easy it is to read tanstack start code. Everything makes sense and flows naturally.',
			author: 'Earnstein',
			role: '@earnstein',
			company: 'Developer',
		},
		{
			quote:
				'TanStack Start inside Astro is literally the perfect stack. Full-stack TypeScript with the best routing and data fetching.',
			author: 'Shayan',
			role: '@shayanAzd',
			company: 'Developer',
		},
		{
			quote:
				"TanStack Start is amazing. It's like Remix and Next had a baby that actually cares about TypeScript.",
			author: 'Melvyn',
			role: '@melvynxdev',
			company: 'Developer',
		},
	],
	featureHighlights: [
		{
			title: 'Enterprise-Grade Routing',
			icon: (
				<Network
					className={twMerge('motion-safe:animate-pulse', textStyles)}
					style={{
						animationDuration: '5s',
						animationTimingFunction: 'ease-in-out',
					}}
				/>
			),
			description: (
				<div>
					Built on TanStack Router, Start comes pre-packed with a{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						fully type-safe and powerfully-unmatched routing system
					</span>{' '}
					that is designed to handle the beefiest of full-stack routing requirements with ease.
					Start builds on top of Router's fully inferred type safety to also provide type-safe
					full-stack APIs that keep you in the fast lane.
				</div>
			),
		},
		{
			title: 'SSR, Streaming and Server RPCs',
			icon: (
				<ServerCrash
					className={twMerge('motion-safe:animate-ping', textStyles)}
					style={{
						animationDuration: '2s',
						animationTimingFunction: 'ease-out',
					}}
				/>
			),
			description: (
				<div>
					Who said rich and interactive applications can't have it all? TanStack Start includes
					powerful capabilities for{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						full-document SSR, streaming, server functions and RPCs
					</span>
					. No more choosing between server-side rendering and top-class client-side interactivity.
					Command the server as you see fit.
				</div>
			),
		},
		{
			title: 'Client-Side First, 100% Server Capable',
			icon: (
				<YinYangIcon
					className={twMerge('motion-safe:animate-spin', textStyles)}
					style={{
						animationDuration: '10s',
						animationTimingFunction: 'ease-in-out',
					}}
				/>
			),
			description: (
				<div>
					While other frameworks continue to compromise on the client-side application experience
					we've cultivated as a front-end community over the years, TanStack Start stays true to the{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						client-side first developer experience,
					</span>{' '}
					while providing a{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						full-featured server-side capable system
					</span>{' '}
					that won't make you compromise on user experience.
				</div>
			),
		},
		{
			title: 'Deploy Anywhere',
			icon: (
				<Rocket
					className={twMerge('motion-safe:animate-bounce', textStyles)}
					style={{
						animationDuration: '2.5s',
						animationTimingFunction: 'ease-in-out',
					}}
				/>
			),
			description: (
				<div>
					TanStack Start can be{' '}
					<span className={twMerge('font-semibold', textStyles)}>deployed anywhere JS can run</span>
					. Whether you're hosting on a traditional server, a serverless platform, or even a CDN,
					Start seamlessly builds, bundles and deploys your application with ease.
				</div>
			),
		},
	],
	handleRedirects: (href: string) => {
		// Redirect from /api-routes to /server-routes
		if (href.match(/\/start\/(latest|v1)\/docs\/framework\/(react|solid)\/api-routes/)) {
			throw redirect({
				href: href.replace('/api-routes', '/server-routes'),
			});
		}
	},
};
