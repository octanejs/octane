import { Bot, Layers, Puzzle, Rocket, Terminal } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { cli } from './libraries';

const textStyles = 'text-indigo-600 dark:text-indigo-400';

export const cliProject = {
	...cli,
	featureHighlights: [
		{
			title: 'MCP Server',
			icon: <Bot className={textStyles} />,
			description: (
				<div>
					Connect your AI assistant to TanStack via the{' '}
					<span className={twMerge('font-semibold', textStyles)}>built-in MCP server</span>. Search
					docs, get integration file changes, and let AI agents help scaffold and configure your
					projects.
				</div>
			),
		},
		{
			title: 'Modular Integrations',
			icon: <Puzzle className={textStyles} />,
			description: (
				<div>
					Choose from a growing ecosystem of{' '}
					<span className={twMerge('font-semibold', textStyles)}>pre-built integrations</span> for
					authentication, databases, styling, deployment, and more.
				</div>
			),
		},
		{
			title: 'Interactive Builder',
			icon: <Layers className={textStyles} />,
			description: (
				<div>
					Use the <span className={twMerge('font-semibold', textStyles)}>web-based Builder UI</span>{' '}
					to visually select your stack, preview generated files, and export your configuration.
				</div>
			),
		},
		{
			title: 'Zero to Production',
			icon: <Terminal className={textStyles} />,
			description: (
				<div>
					Go from{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						zero to a fully configured project
					</span>{' '}
					in seconds with all the boilerplate, configuration, and best practices built in.
				</div>
			),
		},
		{
			title: 'Deploy Anywhere',
			icon: <Rocket className={textStyles} />,
			description: (
				<div>
					Built-in deployment integrations for{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						Cloudflare, Netlify, AWS, and more
					</span>
					. Pre-configured with optimal settings for TanStack Start.
				</div>
			),
		},
	],
};
