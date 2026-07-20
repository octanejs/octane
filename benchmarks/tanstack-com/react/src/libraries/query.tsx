import { WandSparkles, Zap } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { CogsIcon } from '~/components/icons/CogsIcon';
import { query } from './libraries';

const textStyles = 'text-red-500 dark:text-red-400';

export const queryProject = {
	...query,
	description:
		'Powerful asynchronous state management, server-state utilities and data fetching. Fetch, cache, update, and wrangle all forms of async data in your TS/JS, React, Vue, Solid, Svelte, Angular & Lit applications all without touching any "global state"',
	latestBranch: 'main',
	bgRadial: 'from-red-500 via-red-500/60 to-transparent',
	textColor: 'text-amber-500',
	defaultDocs: 'framework/react/overview',
	installPath: 'framework/$framework/installation',
	legacyPackages: ['react-query'],
	testimonials: [
		{
			quote:
				"Honestly, if React Query had been around before Redux, I don't think Redux would have been nearly as popular as it was.",
			author: 'Kent C. Dodds',
			role: '@kentcdodds',
			company: 'Epic Web',
		},
		{
			quote:
				'If I could go back in time and mass myself... I would hand myself a flash drive with a copy of react-query on it.',
			author: 'Kent C. Dodds',
			role: '@kentcdodds',
			company: 'Epic Web',
		},
		{
			quote: "React Query won. There's no denying that.",
			author: 'Theo Browne',
			role: '@t3dotgg',
			company: 'Ping Labs',
		},
		{
			quote: 'TanStack Query has been a game-changer for us. We love using it for react-admin.',
			author: 'react-admin',
			role: '@ReactAdmin',
			company: 'Marmelab',
		},
		{
			quote:
				'The more I use React + Vite + TanStack Router + TypeScript + TanStack Query, the more I love it.',
			author: 'Catalin Pit',
			role: '@catalinmpit',
			company: 'Developer Advocate',
		},
		{
			quote: 'Combined with React Query, this stack has been a game-changer for my productivity.',
			author: 'Dominik (TkDodo)',
			role: '@TkDodo',
			company: 'TanStack',
		},
	],
	featureHighlights: [
		{
			title: 'Declarative & Automatic',
			icon: (
				<WandSparkles
					className={twMerge('motion-safe:animate-pulse', textStyles)}
					style={{
						animationDuration: '5s',
						animationTimingFunction: 'ease-in-out',
					}}
				/>
			),
			description: (
				<div>
					Writing your data fetching logic by hand is over. Tell TanStack Query where to get your
					data and how fresh you need it to be and the rest is automatic. It handles{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						caching, background updates and stale data out of the box with zero-configuration
					</span>
					.
				</div>
			),
		},
		{
			title: 'Simple & Familiar',
			icon: (
				<Zap
					className={twMerge('motion-safe:animate-bounce', textStyles)}
					style={{
						animationDuration: '2s',
						animationTimingFunction: 'ease-in-out',
					}}
				/>
			),
			description: (
				<div>
					If you know how to work with promises or async/await, then you already know how to use
					TanStack Query. There's{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						no global state to manage, reducers, normalization systems or heavy configurations to
						understand
					</span>
					. Simply pass a function that resolves your data (or throws an error) and the rest is
					history.
				</div>
			),
		},
		{
			title: 'Extensible',
			icon: (
				<CogsIcon
					className={twMerge('motion-safe:animate-spin', textStyles)}
					style={{
						animationDuration: '10s',
						animationTimingFunction: 'ease-in-out',
					}}
				/>
			),
			description: (
				<div>
					TanStack Query is configurable down to each observer instance of a query with knobs and
					options to fit every use-case. It comes wired up with{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						dedicated devtools, infinite-loading APIs, and first class mutation tools that make
						updating your data a breeze
					</span>
					. Don't worry though, everything is pre-configured for success!
				</div>
			),
		},
	],
};
