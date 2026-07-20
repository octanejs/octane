import * as React from 'react';
import { useMemo } from 'react';
import { twMerge } from 'tailwind-merge';
import { BookOpen, Code, FileText, Palette, Rocket, Settings2, Terminal } from 'lucide-react';
import {
	useAvailableExamples,
	useAvailableFeatures,
	useFeatures,
	useFramework,
	usePackageManager,
	useProjectName,
	useSelectedExample,
	useSelectedTemplate,
	useSkipGit,
	useSkipInstall,
	useTailwind,
} from './store';
import { useCliCommand } from './useBuilderUrl';
import { GeneratedPromptPreviewCard } from '~/components/application-builder/parts';
import { TEMPLATES } from '~/builder/templates';
import {
	STARTER_AGENTS_CONTEXT_INSTRUCTION,
	STARTER_INTENT_INSTALL_COMMAND,
	STARTER_INTENT_LIST_COMMAND,
	STARTER_INTENT_USAGE_INSTRUCTION,
} from '~/utils/application-starter';

type SummaryFeature = {
	id: string;
	name: string;
	description?: string;
	color?: string;
	link?: string;
};

export type BuilderSummaryData = {
	addOnFeatures: Array<SummaryFeature>;
	cliCommand: string;
	deploymentFeatures: Array<SummaryFeature>;
	exampleName?: string;
	framework: 'react' | 'solid';
	headline: string;
	packageManager: 'bun' | 'npm' | 'pnpm' | 'yarn';
	projectName: string;
	prompt: string;
	selectedTemplate?: string;
	tailwind: boolean;
	toolingFeatures: Array<SummaryFeature>;
};

export function useBuilderSummaryData(): BuilderSummaryData {
	const availableExamples = useAvailableExamples();
	const availableFeatures = useAvailableFeatures();
	const cliCommand = useCliCommand();
	const features = useFeatures();
	const framework = useFramework();
	const packageManager = usePackageManager();
	const projectName = useProjectName();
	const selectedExample = useSelectedExample();
	const selectedTemplate = useSelectedTemplate();
	const skipGit = useSkipGit();
	const skipInstall = useSkipInstall();
	const tailwind = useTailwind();

	return useMemo(() => {
		const templateName = selectedTemplate
			? TEMPLATES.find((template) => template.id === selectedTemplate)?.name
			: undefined;
		const exampleName = selectedExample
			? availableExamples.find((example) => example.id === selectedExample)?.name
			: undefined;

		const selectedFeatures = features
			.map((id) => availableFeatures.find((feature) => feature.id === id))
			.filter((feature): feature is NonNullable<typeof feature> => !!feature);

		const deploymentFeatures = selectedFeatures.filter((feature) => feature.category === 'deploy');
		const toolingFeatures = selectedFeatures.filter((feature) => feature.category === 'tooling');
		const addOnFeatures = selectedFeatures.filter(
			(feature) => feature.category !== 'deploy' && feature.category !== 'tooling',
		);

		const promptSections = [
			[
				`Create a TanStack Start application named ${projectName} using ${framework === 'solid' ? 'Solid' : 'React'}.`,
				'Start by scaffolding the project with the TanStack CLI.',
				`Use this command: ${cliCommand}`,
			].join('\n'),
			[
				`After scaffolding, install dependencies and then wire TanStack Intent into the repo with: ${STARTER_INTENT_INSTALL_COMMAND}`,
				`Then inspect the installed package skills with: ${STARTER_INTENT_LIST_COMMAND}`,
				STARTER_INTENT_USAGE_INSTRUCTION,
				STARTER_AGENTS_CONTEXT_INSTRUCTION,
			].join('\n'),
			[
				templateName ? `Start from the ${templateName} template.` : null,
				exampleName ? `Use the ${exampleName} example as the guiding shape.` : null,
				addOnFeatures.length > 0
					? `Include these integrations: ${addOnFeatures.map((feature) => feature.name).join(', ')}.`
					: 'Keep the stack minimal and add only the essentials already selected.',
				deploymentFeatures.length > 0
					? `Target deployment: ${deploymentFeatures.map((feature) => feature.name).join(', ')}.`
					: null,
				toolingFeatures.length > 0
					? `Tooling choices: ${toolingFeatures.map((feature) => feature.name).join(', ')}.`
					: null,
				`Use ${packageManager} for package management and ${tailwind ? 'keep Tailwind enabled' : 'avoid Tailwind-specific setup'}.`,
			]
				.filter(Boolean)
				.join('\n'),
			[
				skipInstall ? 'Do not install dependencies automatically.' : null,
				skipGit ? 'Do not initialize git automatically.' : null,
			]
				.filter(Boolean)
				.join('\n'),
			'After scaffolding, explain the resulting structure and the next setup steps.',
		].filter(Boolean);

		const headline = [
			framework === 'solid' ? 'Solid' : 'React',
			selectedTemplate ?? 'Custom starter',
			addOnFeatures.length > 0
				? `with ${addOnFeatures
						.slice(0, 3)
						.map((feature) => feature.name)
						.join(', ')}`
				: 'with a minimal stack',
		].join(' ');

		return {
			addOnFeatures,
			cliCommand,
			deploymentFeatures,
			exampleName,
			framework,
			headline,
			packageManager,
			projectName,
			prompt: promptSections.join('\n\n'),
			selectedTemplate: templateName,
			tailwind,
			toolingFeatures,
		};
	}, [
		availableExamples,
		availableFeatures,
		cliCommand,
		features,
		framework,
		packageManager,
		projectName,
		selectedExample,
		selectedTemplate,
		skipGit,
		skipInstall,
		tailwind,
	]);
}

export function BuilderSummaryPanel({
	summary,
	className,
	compact = false,
	overlay,
}: {
	summary: BuilderSummaryData;
	className?: string;
	compact?: boolean;
	overlay?: {
		description: string;
		title: string;
	} | null;
}) {
	return (
		<div
			className={twMerge(
				compact ? '' : 'flex-1 overflow-auto bg-white dark:bg-gray-900',
				className,
			)}
		>
			<div className="relative">
				{overlay ? (
					<div className="absolute inset-0 z-10 flex items-center justify-center rounded-[1rem] bg-white/65 px-6 text-center backdrop-blur-sm dark:bg-gray-950/70">
						<div className="max-w-sm rounded-2xl border border-gray-200 bg-white/95 px-5 py-4 shadow-lg dark:border-gray-800 dark:bg-gray-900/95">
							<div className="text-sm font-semibold text-gray-900 dark:text-white">
								{overlay.title}
							</div>
							<div className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
								{overlay.description}
							</div>
						</div>
					</div>
				) : null}

				<div
					className={twMerge(
						compact
							? 'flex flex-col gap-4'
							: 'mx-auto flex w-full max-w-5xl flex-col gap-5 px-5 py-5 lg:px-8 lg:py-6',
						overlay && 'pointer-events-none select-none blur-sm',
					)}
				>
					<div className="overflow-hidden rounded-[1rem] border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
						<div className={twMerge(compact ? 'px-4 py-4' : 'px-5 py-5 lg:px-6 lg:py-6')}>
							<div className="text-[11px] font-medium uppercase tracking-[0.18em] text-cyan-600/80 dark:text-cyan-300/80">
								Summary
							</div>
							<h2
								className={twMerge(
									'mt-2 font-semibold tracking-[-0.04em] text-gray-950 dark:text-white',
									compact ? 'text-xl' : 'text-2xl',
								)}
							>
								{summary.projectName}
							</h2>
							<p
								className={twMerge(
									'mt-2 max-w-2xl text-gray-600 dark:text-gray-300',
									compact ? 'text-xs leading-5' : 'text-sm leading-6',
								)}
							>
								{summary.headline}
							</p>
							<div className="mt-4 flex flex-wrap gap-2">
								<SummaryBadge
									icon={Code}
									label={summary.framework === 'solid' ? 'Solid' : 'React'}
								/>
								<SummaryBadge icon={Terminal} label={summary.packageManager} />
								<SummaryBadge icon={Palette} label={summary.tailwind ? 'Tailwind' : 'Custom CSS'} />
								<SummaryBadge
									icon={Rocket}
									label={
										summary.deploymentFeatures.length > 0
											? summary.deploymentFeatures.map((feature) => feature.name).join(', ')
											: 'Portable'
									}
								/>
								{summary.selectedTemplate ? (
									<SummaryBadge icon={FileText} label={summary.selectedTemplate} />
								) : null}
								{summary.toolingFeatures.length > 0 ? (
									<SummaryBadge
										icon={Settings2}
										label={summary.toolingFeatures.map((feature) => feature.name).join(', ')}
									/>
								) : null}
								{summary.exampleName ? (
									<SummaryBadge icon={BookOpen} label={summary.exampleName} />
								) : null}
							</div>
						</div>
					</div>

					<div className={twMerge('space-y-4')}>
						<GeneratedPromptPreviewCard prompt={summary.prompt} title="Prompt Preview" />
					</div>
				</div>
			</div>
		</div>
	);
}

function SummaryBadge({
	icon: Icon,
	label,
}: {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
}) {
	return (
		<div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm dark:border-gray-800 dark:bg-gray-950/80 dark:text-gray-300">
			<Icon className="h-3.5 w-3.5" />
			{label}
		</div>
	);
}
