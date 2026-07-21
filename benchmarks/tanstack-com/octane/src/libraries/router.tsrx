import { DatabaseZap, MessageCircleQuestionMark, PlugZap } from '@octanejs/lucide';
import { twMerge } from 'tailwind-merge';
import { router } from './libraries';

const textStyles = 'text-emerald-500 dark:text-emerald-400';

export const routerProject = {
	...router,
	description: `A powerful React router for client-side and full-stack react applications. Fully type-safe APIs, first-class search-params for managing state in the URL and seamless integration with the existing React ecosystem.`,
	latestBranch: 'main',
	docsRoot: 'docs/router',
	bgRadial: 'from-emerald-500 via-lime-600/50 to-transparent',
	textColor: textStyles,
	defaultDocs: 'framework/react/overview',
	installPath: 'framework/$framework/quick-start',
	legacyPackages: ['react-location'],
	hideCodesandboxUrl: true as const,
	showVercelUrl: false,
	showNetlifyUrl: false,
	showCloudflareUrl: false,
	showRailwayUrl: false,
	testimonials: [
		{
			quote: 'The biggest problem with TanStack Router is that once you\'ve worked with it, you\'ll have a harder time going back to other routing solutions.',
			author: 'Dominik (TkDodo)',
			role: '@TkDodo',
			company: 'TanStack',
		},
		{
			quote: 'TanStack Router lives and breathes TypeScript - it\'s meant for it, they are a perfect match.',
			author: 'Dominik (TkDodo)',
			role: '@TkDodo',
			company: 'TanStack',
		},
		{
			quote: 'I took a few hours to switch to the file-based generation and was very impressed. Then I used auto codesplitting and was blown away. This is absolutely phenomenal!',
			author: 'GitHub User',
			role: 'Migration Thread',
			company: 'TanStack Community',
		},
		{
			quote: 'The more I use React + Vite + TanStack Router + TypeScript + TanStack Query, the more I love it.',
			author: 'Catalin Pit',
			role: '@catalinmpit',
			company: 'Developer Advocate',
		},
		{
			quote: 'I just got Elysia to work with TanStack Router, amazing dx so far..',
			author: 'An Le',
			role: '@anlett10',
			company: 'Developer',
		},
		{
			quote: 'I\'ve been using Tanstack Start for a new project and it\'s super good. The server functions completely replace the need for TRPC/GraphQL/REST.',
			author: 'Developer',
			role: 'TanStack Community',
			company: '',
		},
	],
	featureHighlights: [
		{
			title: 'Typesafe & powerful, yet familiarly simple',
			icon: <PlugZap className={twMerge('scale-125', textStyles)} />,
			description: <div>
				TanStack Router builds on modern routing patterns made popular by other tools, but has been
				re-engineered from the ground up to be
				{' '}
				<span class={twMerge('font-semibold', textStyles)}>
					100% typesafe without compromising on DX
				</span>
				. You
				<em>can</em>
				have your cake and eat it too!
			</div>,
		},
		{
			title: 'Built-in Data Fetching with Caching',
			icon: <DatabaseZap
				className={twMerge('motion-safe:animate-spin', textStyles)}
				style={{
					animationDuration: '3s',
					animationTimingFunction: 'ease-in-out',
				}}
			/>,
			description: <div>
				Hoist your data fetching and avoid waterfalls with TanStack Router's loader API and get
				{' '}
				<span class={twMerge('font-semibold', textStyles)}>
					instant navigations with built-in caching and automatic preloading
				</span>
				. Need something more custom? Router's API is designed to work with your favorite
				client-side cache libraries!
			</div>,
		},
		{
			title: 'Search Param APIs to make your state-manager jealous',
			icon: <MessageCircleQuestionMark className={twMerge('', textStyles)} />,
			description: <div>
				Instead of throwing you to the URLSearchParam wolves, TanStack Router outfits you with
				state-manager-grade search param APIs. With
				{' '}
				<span class={twMerge('font-semibold', textStyles)}>
					schemas, validation, full type-safety and pre/post manipulation
				</span>
				, you can manage your state in the URL and easily sync it to your state-manager of choice.
			</div>,
		},
	],
};
