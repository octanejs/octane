import { useCallback, useMemo, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { useBuilderStore } from './store';
import { useBuilderUrl } from './useBuilderUrl';
import { BuilderSummaryPanel, useBuilderSummaryData } from './BuilderSummary';
import { ApplicationStarter } from '~/components/ApplicationStarter';
import { useToast } from '~/components/ToastProvider';
import type { ApplicationStarterResult } from '~/utils/application-starter';
import { downloadBuilderResult } from './client-generation';

export function BuilderWorkspace() {
	useBuilderUrl();

	const [showIntro, setShowIntro] = useState(false);
	const [lastGeneratedBuilderSignature, setLastGeneratedBuilderSignature] = useState<string | null>(
		null,
	);
	const [isPromptDirtySinceGenerate, setIsPromptDirtySinceGenerate] = useState(false);
	const [latestStarterResult, setLatestStarterResult] = useState<ApplicationStarterResult | null>(
		null,
	);
	const features = useBuilderStore((state) => state.features);
	const featureOptions = useBuilderStore((state) => state.featureOptions);
	const framework = useBuilderStore((state) => state.framework);
	const packageManager = useBuilderStore((state) => state.packageManager);
	const projectName = useBuilderStore((state) => state.projectName);
	const selectedTemplate = useBuilderStore((state) => state.selectedTemplate);
	const tailwind = useBuilderStore((state) => state.tailwind);
	const applyStarterRecipe = useBuilderStore((state) => state.applyStarterRecipe);
	const summary = useBuilderSummaryData();
	const { notify } = useToast();
	const displayedSummary = useMemo(
		() =>
			latestStarterResult
				? {
						...summary,
						cliCommand: latestStarterResult.cliCommand,
						prompt: latestStarterResult.prompt,
					}
				: summary,
		[latestStarterResult, summary],
	);

	const currentBuilderSignature = useMemo(
		() =>
			createBuilderSignature({
				featureOptions,
				features,
				framework,
				packageManager,
				projectName,
				selectedTemplate,
				tailwind,
			}),
		[featureOptions, features, framework, packageManager, projectName, selectedTemplate, tailwind],
	);

	const summaryOverlay =
		isPromptDirtySinceGenerate ||
		(lastGeneratedBuilderSignature !== null &&
			currentBuilderSignature !== lastGeneratedBuilderSignature)
			? {
					title: 'Summary out of date',
					description:
						'The prompt or builder options changed. Copy the prompt again to refresh this summary.',
				}
			: null;

	const applyStarterResult = useCallback(
		async (result: ApplicationStarterResult, options?: { silent?: boolean }) => {
			if (result.recipe.target === 'router') {
				if (!options?.silent) {
					notify(
						<div>
							<div className="font-medium">Router-only stays prompt-first</div>
							<div className="text-xs text-gray-500 dark:text-gray-400">
								`/builder` remains a TanStack Start advanced surface.
							</div>
						</div>,
					);
				}

				return false;
			}

			await applyStarterRecipe(result.recipe);
			setLastGeneratedBuilderSignature(createBuilderSignatureFromStore(useBuilderStore.getState()));
			setIsPromptDirtySinceGenerate(false);
			return true;
		},
		[applyStarterRecipe, notify],
	);
	const starterBuilderIntegration = useMemo(
		() => ({
			applyResult: applyStarterResult,
			downloadResult: downloadBuilderResult,
		}),
		[applyStarterResult],
	);

	return (
		<div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-950">
			<div className="mx-auto grid w-full max-w-[1760px] gap-6 px-4 py-4 sm:px-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.82fr)] 2xl:grid-cols-[minmax(0,1.5fr)_minmax(24rem,0.75fr)]">
				<div className="min-w-0">
					{showIntro ? (
						<div className="mb-4 rounded-[28px] border border-cyan-200/60 bg-linear-to-br from-cyan-50 via-white to-white px-5 py-5 shadow-sm dark:border-cyan-900/60 dark:from-cyan-950/30 dark:via-gray-950 dark:to-gray-950 lg:px-7 lg:py-6">
							<div className="text-[11px] font-medium uppercase tracking-[0.18em] text-cyan-600/80 dark:text-cyan-300/80">
								TanStack Builder
							</div>
							<h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-gray-950 dark:text-white lg:text-3xl">
								Describe the app. Keep the tuning light.
							</h1>
							<p className="max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-300 lg:text-base">
								<span className="mt-3 block">
									Start with the agentic builder flow. If you need a CLI-first, ZIP, or deployable
									approximation instead, open CLI mode and use the scaffoldable subset of the stack.
								</span>
							</p>
						</div>
					) : null}

					<ApplicationStarter
						builderIntegration={starterBuilderIntegration}
						className="rounded-[28px]"
						context="builder"
						enableHotkeys
						headerAction={
							<button
								type="button"
								onClick={() => setShowIntro((current) => !current)}
								className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition-colors hover:border-cyan-300 hover:text-cyan-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400 dark:hover:border-cyan-800 dark:hover:text-cyan-300"
								aria-expanded={showIntro}
								aria-label={showIntro ? 'Hide builder help' : 'Show builder help'}
								title={showIntro ? 'Hide builder help' : 'Show builder help'}
							>
								{showIntro ? <X className="h-4 w-4" /> : <HelpCircle className="h-4 w-4" />}
							</button>
						}
						onDirtyStateChange={(dirty) => {
							if (lastGeneratedBuilderSignature !== null) {
								setIsPromptDirtySinceGenerate(dirty);
							}
						}}
						onResolvedResult={setLatestStarterResult}
						revealOptionsImmediately
						showPromptPreview={false}
						tone="cyan"
					/>
				</div>

				<div className="min-w-0 xl:sticky xl:top-0 xl:self-start">
					<BuilderSummaryPanel overlay={summaryOverlay} summary={displayedSummary} compact />
				</div>
			</div>
		</div>
	);
}

function createBuilderSignature({
	featureOptions,
	features,
	framework,
	packageManager,
	projectName,
	selectedTemplate,
	tailwind,
}: {
	featureOptions: Record<string, Record<string, unknown>>;
	features: Array<string>;
	framework: string;
	packageManager: string;
	projectName: string;
	selectedTemplate: string | null;
	tailwind: boolean;
}) {
	const normalizedFeatureOptions = Object.fromEntries(
		Object.entries(featureOptions)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([featureId, options]) => [
				featureId,
				Object.fromEntries(
					Object.entries(options).sort(([left], [right]) => left.localeCompare(right)),
				),
			]),
	);

	return JSON.stringify({
		featureOptions: normalizedFeatureOptions,
		features: [...features].sort(),
		framework,
		packageManager,
		projectName,
		selectedTemplate,
		tailwind,
	});
}

function createBuilderSignatureFromStore(state: ReturnType<typeof useBuilderStore.getState>) {
	return createBuilderSignature({
		featureOptions: state.featureOptions,
		features: state.features,
		framework: state.framework,
		packageManager: state.packageManager,
		projectName: state.projectName,
		selectedTemplate: state.selectedTemplate,
		tailwind: state.tailwind,
	});
}
