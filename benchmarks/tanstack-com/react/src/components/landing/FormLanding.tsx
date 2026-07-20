import * as React from 'react';
import { Link, useParams } from '@tanstack/react-router';
import {
	ArrowRight,
	BadgeCheck,
	BookOpen,
	FileCheck2,
	Fingerprint,
	Keyboard,
	ListChecks,
	Loader2,
	ShieldCheck,
	SlidersHorizontal,
	Split,
	WandSparkles,
} from 'lucide-react';

import { BottomCTA } from '~/components/BottomCTA';
import { Footer } from '~/components/Footer';
import { GithubIcon } from '~/components/icons/GithubIcon';
import { LandingCommunitySection } from '~/components/LandingCommunitySection';
import { SponsorSection } from '~/components/SponsorSection';
import { LibraryDownloadsMicro } from '~/components/LibraryDownloadsMicro';
import { LibraryTestimonials } from '~/components/LibraryTestimonials';
import { LibraryWordmark } from '~/components/LibraryWordmark';
import LandingPageGad from '~/components/LandingPageGad';
import { getLibrary } from '~/libraries';
import { formProject } from '~/libraries/form';
import { LandingCodeExampleCard } from '~/components/landing/LandingCodeExampleCard';
import { formCodeExample } from '~/components/landing/codeExamples';

import { LandingEcosystemProof } from '~/components/landing/LandingEcosystemProof';
import { LandingCopyPromptButton } from '~/components/landing/LandingCopyPromptButton';
const library = getLibrary('form');
const formAgentPrompt = [
	'Build a TanStack Form experience for a TypeScript app.',
	'Use typed form and field APIs, validators, async validation with debouncing where useful, deeply nested object/array fields, and granular subscriptions so only relevant UI updates.',
	'Keep the form headless and render accessible product-specific controls instead of generic form wrappers.',
].join(' ');

const heroProof = [
	{
		label: 'Typed fields',
		value: 'values, errors, validators, submit payloads',
	},
	{
		label: 'Granular reactivity',
		value: 'subscribe to exactly what the UI needs',
	},
	{
		label: 'Headless controls',
		value: 'bring your inputs, layouts, and design system',
	},
];

type FormDemoField = {
	detail: string;
	name: 'profile.email' | 'company.plan' | 'members[2].role';
};

type FormDemoPlan = 'team' | 'enterprise';

const formFields: Array<FormDemoField> = [
	{
		name: 'profile.email',
		detail: 'schema + async availability',
	},
	{
		name: 'company.plan',
		detail: 'recalculates billing preview',
	},
	{
		name: 'members[2].role',
		detail: 'debounced permission check',
	},
];

const formPlanOptions: Array<FormDemoPlan> = ['team', 'enterprise'];

const validationSteps = [
	{
		label: 'Change',
		body: 'Field state updates immediately and only subscribers that care re-render.',
	},
	{
		label: 'Validate',
		body: 'Sync validators run close to the field; async checks can debounce before they touch the network.',
	},
	{
		label: 'Derive',
		body: 'Errors, touched, dirty, canSubmit, and field metadata stay typed and inspectable.',
	},
	{
		label: 'Submit',
		body: 'Submit handlers receive the inferred value shape instead of hand-assembled payloads.',
	},
];

const featureCards = [
	{
		title: 'TypeScript is part of the form model.',
		body: 'Field names, values, validators, errors, and submit handlers stay connected, so refactors travel through the whole form instead of leaving string paths behind.',
		icon: <Fingerprint size={18} />,
	},
	{
		title: 'Headless composition keeps forms honest.',
		body: 'Use components or hooks, but keep the real controls in your product UI. Labels, hints, validation states, layout, and accessibility remain yours.',
		icon: <FileCheck2 size={18} />,
	},
	{
		title: 'Subscriptions make big forms feel small.',
		body: 'A checkout, onboarding wizard, or admin editor can subscribe to narrow field and form state instead of repainting the whole surface on every keystroke.',
		icon: <Split size={18} />,
	},
	{
		title: 'Async validation is built for users.',
		body: 'Debounced async checks, validation events, and pending states let the form stay responsive while slow business rules happen in the background.',
		icon: <Loader2 size={18} />,
	},
];

const fieldStates = [
	{
		label: 'value',
		value: 'form.state.values.profile.email',
	},
	{
		label: 'error',
		value: 'field.state.meta.errors',
	},
	{
		label: 'pending',
		value: 'form.state.isFieldsValidating',
	},
	{
		label: 'submit',
		value: 'form.handleSubmit()',
	},
];

const frameworkAdapters = ['React', 'Vue', 'Angular', 'Solid', 'Lit', 'Svelte', 'Preact'];

export default function FormLanding() {
	const { version } = useParams({ strict: false });
	const resolvedVersion = version ?? library.latestVersion;

	return (
		<div className="w-full min-w-0 overflow-x-hidden bg-[#fffbeb] text-zinc-950 dark:bg-zinc-950 dark:text-white">
			<section className="max-w-full overflow-hidden border-b border-yellow-950/10 bg-[#fff7d6] dark:border-yellow-300/10 dark:bg-[#151005]">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-10 lg:max-w-[80rem] lg:grid-cols-[0.84fr_1.16fr] lg:items-start lg:py-12 xl:max-w-[92rem]">
					<div className="min-w-0 max-w-full sm:max-w-3xl">
						<SectionKicker icon={<ListChecks size={14} />}>Headless form state</SectionKicker>

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
							Forms that stay typed after the first field.
						</p>

						<p className="mt-4 max-w-2xl text-base leading-7 text-zinc-700 dark:text-zinc-300 sm:text-lg">
							Form gives complex, interactive forms a headless state model: typed fields, granular
							subscriptions, validation events, async checks, nested values, and framework adapters
							without forcing a UI wrapper onto your design system.
						</p>

						<LibraryDownloadsMicro
							animateIncreaseTrend
							library={library}
							className="mt-5"
							label="weekly downloads"
							period="weekly"
							showTotals
						/>

						<p className="mt-4 max-w-xl border-l-2 border-yellow-500 pl-3 text-sm font-black text-yellow-900 dark:text-yellow-200">
							The most type-safe form library ever built for TypeScript apps.
						</p>

						<div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
							<FormLink
								to="/$libraryId/$version/docs"
								params={{ libraryId: library.id, version: resolvedVersion }}
								label="Read the docs"
								icon={<BookOpen size={16} aria-hidden="true" />}
							/>
							<LandingCopyPromptButton prompt={formAgentPrompt} label="Copy Form Prompt" />
						</div>

						<div className="mt-8 grid gap-3 sm:grid-cols-3">
							{heroProof.map((proof) => (
								<ProofPill key={proof.label} {...proof} />
							))}
						</div>
						<LandingEcosystemProof />
					</div>

					<FormStatePanel />
				</div>
			</section>

			<section className="border-b border-yellow-950/10 bg-[#fffbea] dark:border-yellow-300/10 dark:bg-[#181205]">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.74fr_1.26fr] xl:max-w-[92rem]">
					<div>
						<SectionKicker icon={<WandSparkles size={14} />}>Why Form</SectionKicker>
						<h2 className="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
							Most form complexity is invisible until it hurts.
						</h2>
						<p className="mt-4 max-w-xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
							The hard part is not rendering an input. It is keeping values, validation, async
							checks, nested fields, submit state, and UI feedback correct as the form grows. Form
							makes that state explicit without making the markup generic.
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
					<ValidationPipeline />
					<div>
						<SectionKicker icon={<ShieldCheck size={14} />}>Validation lifecycle</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Validate at the speed of the user, not the framework.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Trigger validation on the events that matter, debounce expensive checks, show pending
							states precisely, and keep inferred types all the way to submit.
						</p>
					</div>
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-[#fbfaf6] dark:border-zinc-800 dark:bg-zinc-900">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.82fr_1.18fr] lg:items-start xl:max-w-[92rem]">
					<div>
						<SectionKicker icon={<SlidersHorizontal size={14} />}>
							Field subscriptions
						</SectionKicker>
						<h2 className="mt-3 max-w-xl text-3xl font-black leading-tight sm:text-4xl">
							Subscribe to the part of the form this component actually needs.
						</h2>
						<p className="mt-4 max-w-xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Product forms are full of tiny dependencies: badges, summaries, disabled buttons,
							async warnings, derived previews. Form lets those surfaces listen narrowly instead of
							turning every keystroke into a full-form repaint.
						</p>
					</div>

					<SubscriptionPanel />
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
				<div className="mx-auto grid w-full min-w-0 max-w-full gap-8 px-4 py-12 lg:max-w-[80rem] lg:grid-cols-[0.72fr_1.28fr] lg:items-start xl:max-w-[92rem]">
					<div className="max-w-xl">
						<SectionKicker icon={<Keyboard size={14} />}>Framework adapters</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							One form model for every UI runtime.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Use the adapter that matches your framework while keeping the same typed form model,
							validation strategy, and headless composition story.
						</p>
						<div className="mt-5 flex flex-wrap gap-2">
							{frameworkAdapters.map((framework) => (
								<span
									key={framework}
									className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-1.5 text-sm font-bold text-yellow-900 dark:border-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-200"
								>
									{framework}
								</span>
							))}
						</div>
					</div>

					<div className="min-w-0 max-w-full overflow-hidden">
						<LandingCodeExampleCard example={formCodeExample} />
					</div>
				</div>
			</section>

			<section className="border-b border-zinc-200 bg-[#fffbeb] py-12 dark:border-zinc-800 dark:bg-zinc-900">
				<div className="mx-auto w-full max-w-[80rem] px-4 xl:max-w-[92rem]">
					<div className="max-w-3xl">
						<SectionKicker icon={<BadgeCheck size={14} />}>Field notes</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Less code because the form model is doing real work.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							The old copy had the right instinct: fewer hasty abstractions, fewer edge cases, and
							deeper control over the UI. This page now shows where that leverage comes from.
						</p>
					</div>
				</div>

				<div className="mt-8">
					<LibraryTestimonials testimonials={formProject.testimonials} />
				</div>
			</section>

			<section className="bg-white py-12 dark:bg-zinc-950">
				<div className="mx-auto w-full max-w-[80rem] px-4 xl:max-w-[92rem]">
					<div className="max-w-3xl">
						<SectionKicker icon={<GithubIcon className="h-4 w-4" />}>
							Open source ecosystem
						</SectionKicker>
						<h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
							Form is being shaped in public on the way to the next wave of product forms.
						</h2>
						<p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
							Maintainers, examples, framework adapters, partner integrations, and GitHub sponsors
							keep the product close to real-world form pain.
						</p>
					</div>
				</div>

				<div className="mt-10 flex flex-col gap-14">
					<LandingCommunitySection libraryId="form" />
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
				className="border-yellow-500 bg-yellow-500 text-black hover:bg-yellow-600"
			/>
			<Footer />
		</div>
	);
}

function FormStatePanel() {
	const [email, setEmail] = React.useState('sarah@tanstack.com');
	const [plan, setPlan] = React.useState<FormDemoPlan>('team');
	const [role, setRole] = React.useState('admin');
	const isEmailValid = email.includes('@') && email.includes('.');
	const isRolePending = role.length > 0 && role.length < 5;
	const isRoleValid = role.length >= 5;
	const dirtyFields = [email !== 'sarah@tanstack.com', plan !== 'team', role !== 'admin'].filter(
		Boolean,
	).length;
	const canSubmit = isEmailValid && isRoleValid && !isRolePending;

	const getFieldState = (name: FormDemoField['name']) => {
		if (name === 'profile.email') {
			return isEmailValid ? 'valid' : 'error';
		}

		if (name === 'company.plan') {
			return plan === 'enterprise' ? 'dirty' : 'valid';
		}

		if (isRolePending) {
			return 'pending';
		}

		return isRoleValid ? 'valid' : 'error';
	};

	return (
		<div className="w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-yellow-200 bg-white p-4 shadow-sm shadow-yellow-950/5 dark:border-yellow-900 dark:bg-zinc-950">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<span className="h-2.5 w-2.5 rounded-md bg-red-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-yellow-400" />
					<span className="h-2.5 w-2.5 rounded-md bg-emerald-400" />
				</div>
				<span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">form store</span>
			</div>

			<div className="mt-4 space-y-3">
				{formFields.map((field) => (
					<div
						key={field.name}
						className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900"
					>
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0">
								<p className="truncate font-mono text-sm font-black text-zinc-950 dark:text-white">
									{field.name}
								</p>
								<p className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
									{field.detail}
								</p>
							</div>
							<span className="shrink-0 rounded-md bg-yellow-100 px-2 py-1 text-[0.65rem] font-black uppercase text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
								{getFieldState(field.name)}
							</span>
						</div>
						<div className="mt-3">
							{field.name === 'profile.email' ? (
								<input
									className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-bold text-zinc-950 outline-none focus:border-yellow-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
									value={email}
									onChange={(event) => setEmail(event.target.value)}
								/>
							) : field.name === 'company.plan' ? (
								<div className="grid grid-cols-2 gap-2">
									{formPlanOptions.map((option) => (
										<button
											key={option}
											aria-pressed={plan === option}
											className={
												plan === option
													? 'rounded-md border border-yellow-500 bg-yellow-500 px-3 py-2 text-sm font-black capitalize text-black'
													: 'rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-black capitalize text-zinc-700 transition-colors hover:border-yellow-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300'
											}
											type="button"
											onClick={() => setPlan(option)}
										>
											{option}
										</button>
									))}
								</div>
							) : (
								<input
									className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-bold text-zinc-950 outline-none focus:border-yellow-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
									value={role}
									onChange={(event) => setRole(event.target.value)}
								/>
							)}
						</div>
					</div>
				))}
			</div>

			<div className="mt-4 grid gap-3 sm:grid-cols-3">
				{[
					['dirty', `${dirtyFields} fields`],
					['validating', isRolePending ? '1 async' : '0 async'],
					['canSubmit', `${canSubmit}`],
				].map(([label, value]) => (
					<div key={label} className="rounded-lg bg-yellow-50 p-3 dark:bg-yellow-950/25">
						<p className="text-[0.65rem] font-black uppercase text-yellow-800 dark:text-yellow-300">
							{label}
						</p>
						<p className="mt-1 text-sm font-black text-yellow-950 dark:text-yellow-100">{value}</p>
					</div>
				))}
			</div>
		</div>
	);
}

function ValidationPipeline() {
	return (
		<div className="grid gap-3 sm:grid-cols-2">
			{validationSteps.map((step, index) => (
				<div
					key={step.label}
					className="rounded-lg border border-zinc-200 bg-[#fffdf2] p-4 dark:border-zinc-800 dark:bg-zinc-900"
				>
					<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow-100 text-sm font-black text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
						{index + 1}
					</span>
					<h3 className="mt-4 text-lg font-black leading-tight">{step.label}</h3>
					<p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{step.body}</p>
				</div>
			))}
		</div>
	);
}

function SubscriptionPanel() {
	return (
		<div className="min-w-0 rounded-lg border border-yellow-200 bg-white p-4 dark:border-yellow-900 dark:bg-zinc-950">
			<div className="rounded-lg bg-zinc-950 p-4 text-sm text-yellow-100 dark:bg-black">
				<p className="font-mono leading-6">
					useStore(form.store, state =&gt; state.values.profile.email)
					<br />
					form.Subscribe({'{'} selector: state =&gt; state.canSubmit {'}'})
				</p>
			</div>

			<div className="mt-4 grid gap-3 md:grid-cols-2">
				{fieldStates.map((state) => (
					<div
						key={state.label}
						className="rounded-lg border border-zinc-200 bg-[#fffdf2] p-4 dark:border-zinc-800 dark:bg-zinc-900"
					>
						<p className="text-[0.65rem] font-black uppercase text-zinc-500 dark:text-zinc-400">
							{state.label}
						</p>
						<p className="mt-2 break-words font-mono text-sm font-black leading-6 text-zinc-950 dark:text-white">
							{state.value}
						</p>
					</div>
				))}
			</div>
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
			<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow-100 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
				{icon}
			</span>
			<h3 className="mt-4 text-xl font-black leading-tight">{title}</h3>
			<p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{body}</p>
		</div>
	);
}

function SectionKicker({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
	return (
		<p className="inline-flex items-center gap-2 text-sm font-black uppercase text-yellow-700 dark:text-yellow-300">
			{icon}
			{children}
		</p>
	);
}

function ProofPill({ label, value }: { label: string; value: string }) {
	return (
		<div className="border-l-2 border-yellow-500 pl-3">
			<p className="text-sm font-black text-zinc-950 dark:text-white">{label}</p>
			<p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{value}</p>
		</div>
	);
}

function FormLink({
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
