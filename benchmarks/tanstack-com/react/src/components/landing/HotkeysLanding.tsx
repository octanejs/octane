import * as React from 'react';
import { ClientOnly, Link, useParams } from '@tanstack/react-router';
import {
	ArrowRight,
	BookOpen,
	Crosshair,
	Keyboard,
	ListOrdered,
	Monitor,
	Pointer,
	Radio,
	Sparkles,
} from 'lucide-react';

import { BottomCTA } from '~/components/BottomCTA';
import { Footer } from '~/components/Footer';
import { GithubIcon } from '~/components/icons/GithubIcon';
import LandingPageGad from '~/components/LandingPageGad';
import { LandingCommunitySection } from '~/components/LandingCommunitySection';
import { SponsorSection } from '~/components/SponsorSection';
import { LibraryDownloadsMicro } from '~/components/LibraryDownloadsMicro';
import { LibraryWordmark } from '~/components/LibraryWordmark';
import { getLibrary } from '~/libraries';

import { LandingCopyPromptButton } from '~/components/landing/LandingCopyPromptButton';
const library = getLibrary('hotkeys');

const LazyHotkeysShortcutBinding = React.lazy(() =>
	import('~/components/landing/HotkeysShortcut.client').then((m) => ({
		default: m.HotkeysShortcutBinding,
	})),
);

const hotkeysAgentPrompt = [
	'Build a keyboard shortcut system with TanStack Hotkeys.',
	'Use type-safe hotkey strings, cross-platform Mod handling, scoping, input filtering, key state tracking, sequences, recording, display formatting, and framework adapters.',
	'Include a visible shortcut help surface and avoid global shortcuts firing inside text inputs unless explicitly intended.',
].join(' ');

const heroProof = [
	{
		label: 'Type-safe strings',
		value: 'validated modifiers and keys',
	},
	{
		label: 'Cross-platform',
		value: 'Mod maps to Cmd or Ctrl',
	},
	{
		label: 'Context-aware',
		value: 'scopes, inputs, cleanup, conflicts',
	},
];

const shortcutRows = [
	['Mod+K', 'open search'],
	['G then D', 'go to dashboard'],
	['Shift+?', 'show shortcuts'],
	['Esc', 'close current panel'],
];

const featureCards = [
	{
		title: 'Shortcut strings are part of the type system.',
		body: 'Define combinations with a type-safe Hotkey string so invalid modifiers and keys get caught before users do.',
		icon: <Keyboard size={18} />,
	},
	{
		title: 'Mod means the right thing on each platform.',
		body: 'Use one shortcut definition while macOS gets Cmd and other platforms get Ctrl without hand-written platform checks.',
		icon: <Monitor size={18} />,
	},
	{
		title: 'Sequences and holds unlock richer UI.',
		body: 'Support Vim-style sequences, multi-step commands, key hold detection, and contextual command flows.',
		icon: <ListOrdered size={18} />,
	},
	{
		title: 'Recording belongs in the product.',
		body: 'Let users capture and customize shortcuts with recorder utilities instead of building keyboard parsing from scratch.',
		icon: <Radio size={18} />,
	},
];

const lifecycleSteps = [
	{
		label: 'Define',
		body: 'Write a type-safe shortcut string with platform-aware modifiers.',
	},
	{
		label: 'Scope',
		body: 'Attach it globally, to a document, or to a specific element/ref.',
	},
	{
		label: 'Filter',
		body: 'Avoid accidental firing in text inputs or conflicting UI regions.',
	},
	{
		label: 'Handle',
		body: 'Run the command, track key state, record input, or render help text.',
	},
];

const frameworkAdapters = ['React', 'Preact', 'Solid', 'Svelte', 'Vue', 'Angular'];

export default function HotkeysLanding() {
	const { version } = useParams({ strict: false });
	const resolvedVersion = version ?? library.latestVersion;

	return (
		<div className="w-full min-w-0 overflow-x-hidden bg-[#fff1f2] text-zinc-950 dark:bg-zinc-950 dark:text-white">
			<ClientOnly>
				<React.Suspense fallback={null}>
					<LazyHotkeysShortcutBinding />
				</React.Suspense>
			</ClientOnly>

			<section className="max-w-full overflow-hidden border-b border-rose-950/10 bg-[#ffe4e6] dark:border-rose-300/10 dark:bg-[#1d0710]">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-10 lg:max-w-[80rem] lg:grid-cols-[0.84fr_1.16fr] lg:items-start lg:py-12 xl:max-w-[92rem]">
					<div className="min-w-0 max-w-full sm:max-w-3xl">
						<SectionKicker icon={<Keyboard size={14} />}>
							Type-safe keyboard interactions
						</SectionKicker>

						<div className="mt-4 flex flex-wrap items-start gap-x-3 gap-y-2">
							<h1 className="text-5xl font-black leading-[0.95] sm:text-6xl lg:text-7xl">
								<LibraryWordmark library={library} />
							</h1>
							{library.badge ? (
								<span className="rounded-md bg-zinc-950 px-2 py-1 text-xs font-black uppercase text-white dark:bg-white dark:text-zinc-950">
									{library.badge}
								</span>
							) : null}
						</div>

						<p className="mt-5 max-w-2xl text-lg font-bold leading-8 text-zinc-900 dark:text-zinc-100 sm:text-xl">
							Keyboard shortcuts that know where they are allowed to fire.
						</p>

						<p className="mt-4 max-w-2xl text-base leading-7 text-zinc-700 dark:text-zinc-300 sm:text-lg">
							Hotkeys gives apps type-safe shortcut strings, cross-platform Mod handling, scopes,
							sequences, recording, key state tracking, and framework adapters for serious keyboard
							interaction systems.
						</p>

						<LibraryDownloadsMicro
							animateIncreaseTrend
							library={library}
							className="mt-5"
							label="weekly downloads"
							period="weekly"
							showTotals
						/>

						<div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
							<HotkeysLink
								to="/$libraryId/$version/docs"
								params={{ libraryId: library.id, version: resolvedVersion }}
								label="Read the docs"
								icon={<BookOpen size={16} aria-hidden="true" />}
							/>
							<LandingCopyPromptButton prompt={hotkeysAgentPrompt} label="Copy Hotkeys Prompt" />
						</div>

						<div className="mt-8 grid gap-3 sm:grid-cols-3">
							{heroProof.map((proof) => (
								<ProofPill key={proof.label} {...proof} />
							))}
						</div>
					</div>

					<ShortcutPanel />
				</div>
			</section>

			<section className="border-b border-rose-950/10 bg-[#fff7f8] dark:border-rose-300/10 dark:bg-[#230914]">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.74fr_1.26fr] xl:max-w-[92rem]">
					<div>
						<SectionKicker icon={<Sparkles size={14} />}>Why Hotkeys</SectionKicker>
						<h2 className="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
							Keyboard UX is product logic, not an event listener.
						</h2>
						<p className="mt-4 max-w-xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Great shortcuts need platform-aware labels, scoped behavior, input safety, conflict
							avoidance, sequences, recording, and help surfaces. Hotkeys gives those mechanics a
							typed home.
						</p>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						{featureCards.map((feature) => (
							<FeatureCard key={feature.title} {...feature} />
						))}
					</div>
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[1.05fr_0.95fr] lg:items-center xl:max-w-[92rem]">
					<LifecyclePanel />
					<div>
						<SectionKicker icon={<Crosshair size={14} />}>Shortcut lifecycle</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Define, scope, filter, handle.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Hotkeys keeps the full lifecycle explicit so shortcuts feel fast without surprising
							people while they type, edit, or work inside a focused panel.
						</p>
					</div>
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.72fr_1.28fr] lg:items-start xl:max-w-[92rem]">
					<div className="max-w-xl">
						<SectionKicker icon={<Pointer size={14} />}>Framework adapters</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							One keyboard core, product-specific command systems.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Use the core shortcut model across UI runtimes, then wire it into the framework
							adapter and command surface your product needs.
						</p>
						<div className="mt-5 flex flex-wrap gap-2">
							{frameworkAdapters.map((framework) => (
								<span
									key={framework}
									className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-bold text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
								>
									{framework}
								</span>
							))}
						</div>
					</div>
				</div>
			</section>

			<section className="bg-white py-12 dark:bg-zinc-950">
				<div className="mx-auto w-full max-w-[80rem] px-4 xl:max-w-[92rem]">
					<div className="max-w-3xl">
						<SectionKicker icon={<GithubIcon className="h-4 w-4" />}>
							Open source ecosystem
						</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Hotkeys is for apps where keyboard UX is part of the product.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Maintainers, adapters, examples, partners, and GitHub sponsors keep the shortcut
							system grounded in real command-heavy interfaces.
						</p>
					</div>
				</div>

				<div className="mt-10 flex flex-col gap-14">
					<LandingCommunitySection libraryId="hotkeys" />
					<SponsorSection title="GitHub Sponsors" aspectRatio="1/1" packMaxWidth="900px" showCTA />
				</div>
			</section>

			<LandingPageGad />
			<BottomCTA
				linkProps={{
					to: '/$libraryId/$version/docs',
					params: { libraryId: library.id, version: resolvedVersion },
				}}
				label="Get Started!"
				className="border-rose-600 bg-rose-600 text-white hover:bg-rose-700"
			/>
			<Footer />
		</div>
	);
}

function ShortcutPanel() {
	const [activeShortcut, setActiveShortcut] = React.useState('Mod+K');
	const sequenceRef = React.useRef<string | null>(null);

	React.useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			const key = event.key.toLowerCase();

			if ((event.metaKey || event.ctrlKey) && key === 'k') {
				setActiveShortcut('Mod+K');
				return;
			}

			if (event.shiftKey && event.key === '?') {
				setActiveShortcut('Shift+?');
				return;
			}

			if (event.key === 'Escape') {
				setActiveShortcut('Esc');
				return;
			}

			if (sequenceRef.current === 'g' && key === 'd') {
				setActiveShortcut('G then D');
				sequenceRef.current = null;
				return;
			}

			sequenceRef.current = key === 'g' ? 'g' : null;
		};

		window.addEventListener('keydown', handleKeyDown);

		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	}, []);

	return (
		<div className="w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-rose-200 bg-white p-4 shadow-sm shadow-rose-950/5 dark:border-rose-900 dark:bg-zinc-950">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<span className="h-2.5 w-2.5 rounded-md bg-red-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-yellow-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-emerald-400" />
				</div>
				<span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">shortcut map</span>
			</div>

			<div className="mt-4 space-y-3">
				{shortcutRows.map(([keys, action]) => (
					<button
						key={keys}
						aria-pressed={activeShortcut === keys}
						className={
							activeShortcut === keys
								? 'grid w-full gap-3 rounded-lg border border-rose-500 bg-rose-500 p-3 text-left text-white sm:grid-cols-[0.42fr_1fr] sm:items-center'
								: 'grid w-full gap-3 rounded-lg border border-zinc-200 bg-rose-50 p-3 text-left transition-colors hover:border-rose-300 dark:border-zinc-800 dark:bg-rose-950/20 dark:hover:border-rose-800 sm:grid-cols-[0.42fr_1fr] sm:items-center'
						}
						type="button"
						onClick={() => setActiveShortcut(keys)}
					>
						<kbd
							className={
								activeShortcut === keys
									? 'rounded-md bg-white px-3 py-2 text-center font-mono text-sm font-black text-rose-700'
									: 'rounded-md bg-zinc-950 px-3 py-2 text-center font-mono text-sm font-black text-white dark:bg-white dark:text-zinc-950'
							}
						>
							{keys}
						</kbd>
						<span className="font-bold">{action}</span>
					</button>
				))}
			</div>

			<div className="mt-4 rounded-lg bg-zinc-950 p-4 text-sm text-rose-100 dark:bg-black">
				<p className="font-mono leading-6">
					useHotkey(&quot;{activeShortcut}&quot;, runCommand, {'{'} enabled: isPanelOpen {'}'})
				</p>
			</div>
		</div>
	);
}

function LifecyclePanel() {
	return (
		<div className="grid gap-3 sm:grid-cols-2">
			{lifecycleSteps.map((step, index) => (
				<div
					key={step.label}
					className="rounded-lg border border-zinc-200 bg-[#fff1f2] p-4 dark:border-zinc-800 dark:bg-zinc-900"
				>
					<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-100 text-sm font-black text-rose-800 dark:bg-rose-950 dark:text-rose-200">
						{index + 1}
					</span>
					<h3 className="mt-4 text-lg font-black leading-tight">{step.label}</h3>
					<p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{step.body}</p>
				</div>
			))}
		</div>
	);
}

function FeatureCard({
	body,
	icon,
	title,
}: {
	body: string;
	icon: React.ReactNode;
	title: string;
}) {
	return (
		<div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
			<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200">
				{icon}
			</span>
			<h3 className="mt-4 text-xl font-black leading-tight">{title}</h3>
			<p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{body}</p>
		</div>
	);
}

function SectionKicker({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
	return (
		<p className="inline-flex items-center gap-2 text-sm font-black uppercase text-rose-700 dark:text-rose-300">
			{icon}
			{children}
		</p>
	);
}

function ProofPill({ label, value }: { label: string; value: string }) {
	return (
		<div className="border-l-2 border-rose-500 pl-3">
			<p className="text-sm font-black text-zinc-950 dark:text-white">{label}</p>
			<p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{value}</p>
		</div>
	);
}

function HotkeysLink({
	icon,
	label,
	params,
	to,
}: {
	icon: React.ReactNode;
	label: string;
	params: Record<string, string>;
	to: string;
}) {
	return (
		<Link
			to={to}
			params={params}
			className="inline-flex w-full max-w-full items-center justify-center gap-2 rounded-lg border border-zinc-950 bg-zinc-950 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-zinc-800 dark:border-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 sm:w-auto"
		>
			{icon}
			{label}
			<ArrowRight size={15} aria-hidden="true" />
		</Link>
	);
}
