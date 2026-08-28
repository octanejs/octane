// The demo registry: the one place a demo is declared.
//
// Adding a demo means adding an entry here — the nav, the router and the source
// pane all read from this list, so none of them need to know about individual
// demos. Sources are imported with Vite's `?raw` so the Source tab shows the
// exact file on disk rather than a copy that can rot.
import { CommandMenu } from './demos/CommandMenu.tsrx';
import { AnimeJsDemo } from './demos/AnimeJs.tsrx';
import { Conditional } from './demos/Conditional.tsrx';
import { Counter } from './demos/Counter.tsrx';
import { DynamicDemo } from './demos/Dynamic.tsrx';
import { DreiDemo } from './demos/Drei.tsrx';
import { DoomDemo } from './demos/doom/Doom.tsrx';
import { Inputs } from './demos/Inputs.tsrx';
import { GSAPDemo } from './demos/GSAP.tsrx';
import { IntersectionObserverDemo } from './demos/IntersectionObserver.tsrx';
import { InputOTPDemo } from './demos/InputOTP.tsrx';
import { KeyedList } from './demos/KeyedList.tsrx';
import { ReactSpringDemo } from './demos/ReactSpring.tsrx';
import { ErrorBoundaryDemo } from './demos/ErrorBoundary.tsrx';
import { FormischDemo } from './demos/Formisch.tsrx';
import { LiveStoreDemo } from './demos/LiveStore.tsrx';
import { ReactTextareaAutosizeDemo } from './demos/ReactTextareaAutosize.tsrx';
import { ReactSyntaxHighlighterDemo } from './demos/ReactSyntaxHighlighter.tsrx';
import { ReactColorfulDemo } from './demos/ReactColorful.tsrx';
import { PopperDemo } from './demos/Popper.tsrx';
import { PdfDemo } from './demos/Pdf.tsrx';
import { MantineHooksDemo } from './demos/MantineHooks.tsrx';
import { ReactDraggableDemo } from './demos/ReactDraggable.tsrx';
import { MobxDemo } from './demos/Mobx.tsrx';
import { PhosphorIconsDemo } from './demos/PhosphorIcons.tsrx';
import { RxJSDemo } from './demos/RxJS.tsrx';
import { RainbowKitDemo } from './demos/RainbowKit.tsrx';
import { ReactDropzoneDemo } from './demos/ReactDropzone.tsrx';
import { ReactResizablePanelsDemo } from './demos/ReactResizablePanels.tsrx';
import { ReactMarkdownDemo } from './demos/ReactMarkdown.tsrx';
import { ReactWindowDemo } from './demos/ReactWindow.tsrx';
import { ShadcnBasesDemo } from './demos/ShadcnBases.tsrx';
import { SolanaDemo } from './demos/Solana.tsrx';
import { SuspenseDemo } from './demos/Suspense.tsrx';
import { SWRDemo } from './demos/SWR.tsrx';
import { WagmiDemo } from './demos/Wagmi.tsrx';
import { UseHooksTsDemo } from './demos/UseHooksTs.tsrx';
import { AlienSignalsDemo } from './demos/AlienSignals.tsrx';

import commandMenuSource from './demos/CommandMenu.tsrx?raw';
import animeJsSource from './demos/AnimeJs.tsrx?raw';
import conditionalSource from './demos/Conditional.tsrx?raw';
import counterSource from './demos/Counter.tsrx?raw';
import dynamicSource from './demos/Dynamic.tsrx?raw';
import dreiSource from './demos/Drei.tsrx?raw';
import doomShellSource from './demos/doom/Doom.tsrx?raw';
import doomSceneSource from './demos/doom/Doom.three.tsrx?raw';
import doomModelSource from './demos/doom/model.ts?raw';
import doomAssetsSource from './demos/doom/assets.ts?raw';
import inputsSource from './demos/Inputs.tsrx?raw';
import gsapSource from './demos/GSAP.tsrx?raw';
import intersectionObserverSource from './demos/IntersectionObserver.tsrx?raw';
import inputOTPSource from './demos/InputOTP.tsrx?raw';
import keyedListSource from './demos/KeyedList.tsrx?raw';
import reactSpringSource from './demos/ReactSpring.tsrx?raw';
import errorBoundarySource from './demos/ErrorBoundary.tsrx?raw';
import formischSource from './demos/Formisch.tsrx?raw';
import liveStoreSource from './demos/LiveStore.tsrx?raw';
import reactTextareaAutosizeSource from './demos/ReactTextareaAutosize.tsrx?raw';
import reactSyntaxHighlighterSource from './demos/ReactSyntaxHighlighter.tsrx?raw';
import reactColorfulSource from './demos/ReactColorful.tsrx?raw';
import popperSource from './demos/Popper.tsrx?raw';
import pdfSource from './demos/Pdf.tsrx?raw';
import mantineHooksSource from './demos/MantineHooks.tsrx?raw';
import reactDraggableSource from './demos/ReactDraggable.tsrx?raw';
import mobxSource from './demos/Mobx.tsrx?raw';
import phosphorIconsSource from './demos/PhosphorIcons.tsrx?raw';
import rxjsSource from './demos/RxJS.tsrx?raw';
import rainbowKitSource from './demos/RainbowKit.tsrx?raw';
import reactDropzoneSource from './demos/ReactDropzone.tsrx?raw';
import reactResizablePanelsSource from './demos/ReactResizablePanels.tsrx?raw';
import reactMarkdownSource from './demos/ReactMarkdown.tsrx?raw';
import reactWindowSource from './demos/ReactWindow.tsrx?raw';
import shadcnSource from './demos/ShadcnBases.tsrx?raw';
import solanaSource from './demos/Solana.tsrx?raw';
import suspenseSource from './demos/Suspense.tsrx?raw';
import swrSource from './demos/SWR.tsrx?raw';
import wagmiSource from './demos/Wagmi.tsrx?raw';
import useHooksTsSource from './demos/UseHooksTs.tsrx?raw';
import alienSignalsSource from './demos/AlienSignals.tsrx?raw';

export interface Demo {
	/** Stable id — also the URL route, so renaming one breaks shared links. */
	readonly id: string;
	readonly title: string;
	readonly Component: () => unknown;
	readonly source: string;
}

export interface DemoGroup {
	readonly id: string;
	readonly label: string;
	readonly demos: readonly Demo[];
}

export const GROUPS: readonly DemoGroup[] = [
	{
		id: 'state',
		label: 'State',
		demos: [
			{
				id: 'alien-signals',
				title: 'Alien Signals',
				Component: AlienSignalsDemo,
				source: alienSignalsSource,
			},
		],
	},
	{
		id: 'games',
		label: 'Games',
		demos: [
			{
				id: 'doom',
				title: 'Doom',
				Component: DoomDemo,
				source: [
					'// Doom.tsrx',
					doomShellSource,
					'// Doom.three.tsrx',
					doomSceneSource,
					'// model.ts',
					doomModelSource,
					'// assets.ts',
					doomAssetsSource,
				].join('\n\n'),
			},
		],
	},
	{
		id: 'language',
		label: 'Language',
		demos: [
			{
				id: 'react-markdown',
				title: 'react-markdown',
				Component: ReactMarkdownDemo,
				source: reactMarkdownSource,
			},
			{
				id: 'react-draggable',
				title: 'React Draggable',
				Component: ReactDraggableDemo,
				source: reactDraggableSource,
			},
			{
				id: 'counter',
				title: 'Counter',
				Component: Counter,
				source: counterSource,
			},
			{
				id: 'keyed-list',
				title: 'Keyed list',
				Component: KeyedList,
				source: keyedListSource,
			},
			{
				id: 'conditional',
				title: 'Conditional',
				Component: Conditional,
				source: conditionalSource,
			},
			{
				id: 'inputs',
				title: 'Inputs + @switch',
				Component: Inputs,
				source: inputsSource,
			},
			{
				id: 'dynamic',
				title: 'Dynamic tag',
				Component: DynamicDemo,
				source: dynamicSource,
			},
			{
				id: 'suspense',
				title: 'Suspense',
				Component: SuspenseDemo,
				source: suspenseSource,
			},
		],
	},
	{
		id: 'components',
		label: 'Components',
		demos: [
			{
				id: 'react-spring',
				title: 'React Spring',
				Component: ReactSpringDemo,
				source: reactSpringSource,
			},
			{
				id: 'input-otp',
				title: 'Input OTP',
				Component: InputOTPDemo,
				source: inputOTPSource,
			},
			{
				id: 'animejs',
				title: 'Anime.js',
				Component: AnimeJsDemo,
				source: animeJsSource,
			},
			{
				id: 'drei',
				title: 'Drei',
				Component: DreiDemo,
				source: dreiSource,
			},
			{
				id: 'gsap',
				title: 'GSAP',
				Component: GSAPDemo,
				source: gsapSource,
			},
			{
				id: 'intersection-observer',
				title: 'Intersection Observer',
				Component: IntersectionObserverDemo,
				source: intersectionObserverSource,
			},
			{
				id: 'react-resizable-panels',
				title: 'Resizable panels',
				Component: ReactResizablePanelsDemo,
				source: reactResizablePanelsSource,
			},
			{
				id: 'cmdk',
				title: 'Command menu',
				Component: CommandMenu,
				source: commandMenuSource,
			},
			{
				id: 'shadcn',
				title: 'shadcn/ui (all bases)',
				Component: ShadcnBasesDemo,
				source: shadcnSource,
			},
			{
				id: 'livestore',
				title: 'LiveStore',
				Component: LiveStoreDemo,
				source: liveStoreSource,
			},
			{
				id: 'phosphor-icons',
				title: 'Phosphor Icons',
				Component: PhosphorIconsDemo,
				source: phosphorIconsSource,
			},
			{
				id: 'react-window',
				title: 'react-window',
				Component: ReactWindowDemo,
				source: reactWindowSource,
			},
			{
				id: 'solana',
				title: 'Solana',
				Component: SolanaDemo,
				source: solanaSource,
			},
			{
				id: 'rxjs',
				title: 'RxJS',
				Component: RxJSDemo,
				source: rxjsSource,
			},
			{
				id: 'swr',
				title: 'SWR',
				Component: SWRDemo,
				source: swrSource,
			},
			{
				id: 'wagmi',
				title: 'Wagmi',
				Component: WagmiDemo,
				source: wagmiSource,
			},
			{
				id: 'rainbowkit',
				title: 'RainbowKit',
				Component: RainbowKitDemo,
				source: rainbowKitSource,
			},
			{
				id: 'react-dropzone',
				title: 'React Dropzone',
				Component: ReactDropzoneDemo,
				source: reactDropzoneSource,
			},
			{
				id: 'usehooks-ts',
				title: 'usehooks-ts',
				Component: UseHooksTsDemo,
				source: useHooksTsSource,
			},
			{
				id: 'mantine-hooks',
				title: 'Mantine Hooks',
				Component: MantineHooksDemo,
				source: mantineHooksSource,
			},
			{
				id: 'mobx',
				title: 'MobX',
				Component: MobxDemo,
				source: mobxSource,
			},
			{
				id: 'formisch',
				title: 'Formisch',
				Component: FormischDemo,
				source: formischSource,
			},
			{
				id: 'error-boundary',
				title: 'Error boundary',
				Component: ErrorBoundaryDemo,
				source: errorBoundarySource,
			},
			{
				id: 'react-textarea-autosize',
				title: 'React Textarea Autosize',
				Component: ReactTextareaAutosizeDemo,
				source: reactTextareaAutosizeSource,
			},
			{
				id: 'react-syntax-highlighter',
				title: 'React Syntax Highlighter',
				Component: ReactSyntaxHighlighterDemo,
				source: reactSyntaxHighlighterSource,
			},
			{
				id: 'react-colorful',
				title: 'Color picker',
				Component: ReactColorfulDemo,
				source: reactColorfulSource,
			},
			{
				id: 'popper',
				title: 'Popper',
				Component: PopperDemo,
				source: popperSource,
			},
			{
				id: 'pdf',
				title: 'React PDF',
				Component: PdfDemo,
				source: pdfSource,
			},
		],
	},
];

const BY_ID = new Map(GROUPS.flatMap((group) => group.demos).map((demo) => [demo.id, demo]));

export const DEFAULT_DEMO_ID = 'counter';

/** The demo for a route, falling back to the default for an unknown or empty one. */
export function resolveDemo(route: string): Demo {
	return BY_ID.get(route) ?? BY_ID.get(DEFAULT_DEMO_ID)!;
}
