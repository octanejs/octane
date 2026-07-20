import { Keyboard, ListOrdered, WandSparkles } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { hotkeys } from './libraries';

const textStyles = 'text-rose-600 dark:text-rose-500';

export const hotkeysProject = {
	...hotkeys,
	description: `A type-safe, cross-platform hotkey library with sequence detection, key state tracking, hotkey recording, and framework adapters for React and more.`,
	latestBranch: 'main',
	bgRadial: 'from-rose-500 via-rose-700/50 to-transparent',
	textColor: 'text-rose-700',
	defaultDocs: 'overview',
	featureHighlights: [
		{
			title: 'Type-Safe & Cross-Platform',
			icon: <Keyboard className={twMerge(textStyles)} />,
			description: (
				<div>
					Define keyboard shortcuts with a{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						fully type-safe Hotkey string type
					</span>{' '}
					that validates key combinations at the type level. Cross-platform <code>Mod</code>{' '}
					modifier automatically maps to Cmd on macOS and Ctrl elsewhere, so your shortcuts work
					everywhere without platform checks.
				</div>
			),
		},
		{
			title: 'Better Defaults',
			icon: <WandSparkles className={twMerge(textStyles)} />,
			description: (
				<div>
					Ships with{' '}
					<span className={twMerge('font-semibold', textStyles)}>sensible and safe defaults</span>,
					including automatic <code>preventDefault</code> and <code>stopPropagation</code>, smartly
					ignoring shortcuts when input fields are focused, and automatic cleanup on unmount.
					Scoping hotkeys to refs or elements is easy, making it straightforward to define
					context-aware keyboard shortcuts without unexpected side-effects.
				</div>
			),
		},
		{
			title: 'Sequences & Recording',
			icon: <ListOrdered className={twMerge(textStyles)} />,
			description: (
				<div>
					Build{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						multi-step keyboard sequences
					</span>{' '}
					like Vim-style commands or cheat codes with configurable timeouts. Let users record and
					customize their own shortcuts with the built-in hotkey recorder that captures modifier and
					key combinations in real time.
				</div>
			),
		},
	],
};
