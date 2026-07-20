import * as React from 'react';
import { Link, useParams } from '@tanstack/react-router';
import {
	ArrowRight,
	BookOpen,
	Gauge,
	GitBranch,
	MoveHorizontal,
	Ruler,
	SlidersHorizontal,
	Sparkles,
	StretchHorizontal,
} from 'lucide-react';

import { BottomCTA } from '~/components/BottomCTA';
import { Footer } from '~/components/Footer';
import { GithubIcon } from '~/components/icons/GithubIcon';
import LandingPageGad from '~/components/LandingPageGad';
import { LandingCommunitySection } from '~/components/LandingCommunitySection';
import { SponsorSection } from '~/components/SponsorSection';
import { LibraryDownloadsMicro } from '~/components/LibraryDownloadsMicro';
import { LibraryWordmark } from '~/components/LibraryWordmark';
import { StackBlitzSection } from '~/components/StackBlitzSection';
import { getBranch, getLibrary } from '~/libraries';
import { rangerProject } from '~/libraries/ranger';

import { LandingCopyPromptButton } from '~/components/landing/LandingCopyPromptButton';
const library = getLibrary('ranger');
const rangerAgentPrompt = [
	'Build a custom range or multi-range slider with TanStack Ranger.',
	'Keep the slider headless: own the markup, track, ticks, labels, thumbs, formatting, and accessibility while using Ranger for range math and thumb interaction state.',
	'Show min/max, steps, multiple thumbs, constrained movement, and product-specific styling.',
].join(' ');

const heroProof = [
	{
		label: 'Headless track',
		value: 'bring your own UI and semantics',
	},
	{
		label: 'Multi-thumb',
		value: 'ranges, bounds, steps, constraints',
	},
	{
		label: 'React hooks',
		value: 'range math without a slider skin',
	},
];

const featureCards = [
	{
		title: 'The slider is yours.',
		body: 'Ranger gives interaction state and range math without rendering the track, thumbs, labels, or layout for you.',
		icon: <SlidersHorizontal size={18} />,
	},
	{
		title: 'Multi-range without bespoke math.',
		body: 'Build price filters, timelines, editors, split ranges, or multi-thumb controls with bounds and steps handled predictably.',
		icon: <MoveHorizontal size={18} />,
	},
	{
		title: 'Ticks and labels can be product-specific.',
		body: 'Display percentages, dates, currency, logarithmic labels, marks, or custom annotations from the same headless primitives.',
		icon: <Ruler size={18} />,
	},
	{
		title: 'Small utility, high inversion of control.',
		body: 'Ranger is useful precisely because it does not become your design system. It stays under the component you actually need.',
		icon: <Gauge size={18} />,
	},
];

const rangeSteps = [
	{
		label: 'Values',
		body: 'Start with one value, two bounds, or a set of range handles.',
	},
	{
		label: 'Track',
		body: 'Map percentages and segments into your own track UI.',
	},
	{
		label: 'Thumbs',
		body: 'Render handles with labels, tooltips, constraints, and focus state.',
	},
	{
		label: 'Commit',
		body: 'Send final values into filters, charts, editors, or forms.',
	},
];

export default function RangerLanding() {
	const { version } = useParams({ strict: false });
	const resolvedVersion = version ?? library.latestVersion;
	const branch = getBranch(rangerProject, resolvedVersion);

	return (
		<div className="w-full min-w-0 overflow-x-hidden bg-zinc-100 text-zinc-950 dark:bg-zinc-950 dark:text-white">
			<section className="max-w-full overflow-hidden border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-10 lg:max-w-[80rem] lg:grid-cols-[0.84fr_1.16fr] lg:items-start lg:py-12 xl:max-w-[92rem]">
					<div className="min-w-0 max-w-full sm:max-w-3xl">
						<SectionKicker icon={<StretchHorizontal size={14} />}>
							Headless range controls
						</SectionKicker>

						<h1 className="mt-4 text-5xl font-black leading-[0.95] sm:text-6xl lg:text-7xl">
							<LibraryWordmark library={library} />
						</h1>

						<p className="mt-5 max-w-2xl text-lg font-bold leading-8 text-zinc-900 dark:text-zinc-100 sm:text-xl">
							Build the slider your product actually needs.
						</p>

						<p className="mt-4 max-w-2xl text-base leading-7 text-zinc-700 dark:text-zinc-300 sm:text-lg">
							Ranger provides headless primitives for range and multi-range sliders, leaving the
							track, thumbs, labels, ticks, and product UI completely under your control.
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
							<RangerLink
								to="/$libraryId/$version/docs"
								params={{ libraryId: library.id, version: resolvedVersion }}
								label="Read the docs"
								icon={<BookOpen size={16} aria-hidden="true" />}
							/>
							<LandingCopyPromptButton prompt={rangerAgentPrompt} label="Copy Ranger Prompt" />
						</div>

						<div className="mt-8 grid gap-3 sm:grid-cols-3">
							{heroProof.map((proof) => (
								<ProofPill key={proof.label} {...proof} />
							))}
						</div>
					</div>

					<RangerLabPanel />
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.74fr_1.26fr] xl:max-w-[92rem]">
					<div>
						<SectionKicker icon={<Sparkles size={14} />}>Why Ranger</SectionKicker>
						<h2 className="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
							Range controls are small until the product gets specific.
						</h2>
						<p className="mt-4 max-w-xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Once a slider needs multiple thumbs, custom labels, controlled values, meaningful
							ticks, and a design system skin, a prebuilt UI becomes the wrong abstraction. Ranger
							keeps the hard math below your component.
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
					<StepPanel />
					<div>
						<SectionKicker icon={<GitBranch size={14} />}>Slider lifecycle</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Values in, product-specific control out.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Ranger helps translate values into interactive geometry. Your app decides what those
							values mean and how the user should see them.
						</p>
					</div>
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.72fr_1.28fr] lg:items-start xl:max-w-[92rem]">
					<div className="max-w-xl">
						<SectionKicker icon={<SlidersHorizontal size={14} />}>Example</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Take the range math for a spin.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							The example stays simple on purpose: hooks provide the behavior, and the component
							owns the rendered slider.
						</p>
					</div>
				</div>
			</section>

			<StackBlitzSection
				project={rangerProject}
				branch={branch}
				examplePath="examples/${framework}/basic"
				title="tannerlinsley/react-ranger: basic"
			/>

			<section className="bg-white py-12 dark:bg-zinc-950">
				<div className="mx-auto w-full max-w-[80rem] px-4 xl:max-w-[92rem]">
					<div className="max-w-3xl">
						<SectionKicker icon={<GithubIcon className="h-4 w-4" />}>
							Open source ecosystem
						</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Ranger stays small so your component can be specific.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Maintainers, examples, partners, and GitHub sponsors keep the headless range primitive
							useful without turning it into a UI kit.
						</p>
					</div>
				</div>

				<div className="mt-10 flex flex-col gap-14">
					<LandingCommunitySection libraryId="ranger" />
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
				className="border-zinc-950 bg-zinc-950 text-white hover:bg-zinc-800 dark:border-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
			/>
			<Footer />
		</div>
	);
}

function RangerLabPanel() {
	const [values, setValues] = React.useState<Array<number>>([120, 310, 640]);
	const sortedValues = [...values].sort((a, b) => a - b);
	const updateValue = (index: number, nextValue: number) => {
		setValues((current) => {
			const minValue = index > 0 ? current[index - 1] + 10 : 0;
			const maxValue = index < current.length - 1 ? current[index + 1] - 10 : 1000;
			const nextValues = current.map((value, valueIndex) =>
				valueIndex === index ? Math.min(Math.max(nextValue, minValue), maxValue) : value,
			);

			return nextValues;
		});
	};

	return (
		<div className="w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-zinc-300 bg-white p-4 shadow-sm shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-950">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<span className="h-2.5 w-2.5 rounded-md bg-red-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-yellow-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-emerald-400" />
				</div>
				<span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
					multi-range slider
				</span>
			</div>

			<div className="mt-8 px-2">
				<div className="relative h-4 rounded-full bg-zinc-200 dark:bg-zinc-800">
					<div
						className="absolute top-0 h-4 rounded-full bg-zinc-950 dark:bg-white"
						style={{
							left: `${sortedValues[0] / 10}%`,
							right: `${100 - sortedValues[sortedValues.length - 1] / 10}%`,
						}}
					/>
					{values.map((value, index) => (
						<div
							key={index}
							className="absolute top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-zinc-950 shadow-md dark:border-zinc-950 dark:bg-white"
							style={{ left: `${value / 10}%` }}
						>
							<span className="absolute left-1/2 top-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-950 px-2 py-1 text-xs font-black text-white dark:bg-white dark:text-zinc-950">
								${value}
							</span>
						</div>
					))}
				</div>
				<div className="mt-16 grid grid-cols-5 text-center text-xs font-bold text-zinc-500 dark:text-zinc-400">
					{['0', '250', '500', '750', '1000'].map((tick) => (
						<span key={tick}>{tick}</span>
					))}
				</div>
			</div>

			<div className="mt-6 grid gap-2">
				{values.map((value, index) => (
					<label key={index} className="grid gap-1">
						<span className="text-[0.65rem] font-black uppercase text-zinc-500 dark:text-zinc-400">
							Handle {index + 1}
						</span>
						<input
							className="accent-zinc-950 dark:accent-white"
							max={1000}
							min={0}
							step={10}
							type="range"
							value={value}
							onChange={(event) => updateValue(index, event.currentTarget.valueAsNumber)}
						/>
					</label>
				))}
			</div>

			<div className="mt-6 rounded-lg bg-zinc-950 p-4 text-sm text-zinc-100 dark:bg-black">
				<p className="font-mono leading-6">
					useRanger({'{'} getRangerElement: () =&gt; rangerRef.current,
					<br />
					&nbsp;&nbsp;min: 0, max: 1000,
					<br />
					&nbsp;&nbsp;stepSize: 10, values: [{values.join(', ')}],
					<br />
					&nbsp;&nbsp;onChange: instance =&gt; setValues(instance.sortedValues) {'}'})
				</p>
			</div>
		</div>
	);
}

function StepPanel() {
	return (
		<div className="grid gap-3 sm:grid-cols-2">
			{rangeSteps.map((step, index) => (
				<div
					key={step.label}
					className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900"
				>
					<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-950 text-sm font-black text-white dark:bg-white dark:text-zinc-950">
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
			<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-950 text-white dark:bg-white dark:text-zinc-950">
				{icon}
			</span>
			<h3 className="mt-4 text-xl font-black leading-tight">{title}</h3>
			<p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{body}</p>
		</div>
	);
}

function SectionKicker({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
	return (
		<p className="inline-flex items-center gap-2 text-sm font-black uppercase text-zinc-700 dark:text-zinc-300">
			{icon}
			{children}
		</p>
	);
}

function ProofPill({ label, value }: { label: string; value: string }) {
	return (
		<div className="border-l-2 border-zinc-950 pl-3 dark:border-white">
			<p className="text-sm font-black text-zinc-950 dark:text-white">{label}</p>
			<p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{value}</p>
		</div>
	);
}

function RangerLink({
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
