/**
 * Deploy Dialog Component
 *
 * Dialog for deploying a project to GitHub and then to a cloud provider.
 */

import { useState, useEffect, useCallback } from 'octane';
import { Loader2, ExternalLink, AlertCircle, Check, Lock, Globe, Rocket } from '@octanejs/lucide';
import { twMerge } from 'tailwind-merge';
import { useAsyncDebouncer } from '@octanejs/tanstack-pacer';
import { Button, GitHub } from '~/ui';
import { useDeployAuth } from './useDeployAuth';
import {
	useFeatures,
	useFeatureOptions,
	useFramework,
	usePackageManager,
	useTailwind,
	useProjectName,
} from './store';
import {
	type DeployProvider,
	type DeployState,
	type RepoNameStatus,
	PROVIDER_INFO,
	checkRepoNameAvailability,
	validateRepoNameFormat,
} from '../deploy/shared';
import {
	getRecipeBuilderFeatures,
	type ApplicationStarterRecipe,
} from '~/utils/application-starter';
import type { BuilderAction } from '~/utils/analytics';
import { compileBuilderProject } from './client-generation';

interface DeployDialogProps {
	isOpen: boolean;
	onClose: () => void;
	provider?: DeployProvider | null;
	starterRecipe?: ApplicationStarterRecipe | null;
	/**
 * Fires `builder_activated` events with the parent's session context
 * (mode_used, idea_used). Optional so the dialog can render outside the
 * builder flow without an analytics trail.
 */
	onTrackActivation?: (params: {
		action: BuilderAction;
		surface: 'deploy_dialog';
		provider?: string;
		automatic?: boolean;
	}) => void;
}

export function DeployDialog({
	isOpen,
	onClose,
	provider,
	starterRecipe,
	onTrackActivation,
}: DeployDialogProps) {
	const auth = useDeployAuth();
	const builderFeatures = useFeatures();
	const builderFeatureOptions = useFeatureOptions();
	const builderFramework = useFramework();
	const builderPackageManager = usePackageManager();
	const builderTailwind = useTailwind();
	const builderProjectName = useProjectName();

	const features =
		starterRecipe ? getRecipeBuilderFeatures(starterRecipe) : builderFeatures;
	const featureOptions = starterRecipe?.featureOptions ?? builderFeatureOptions;
	const framework = starterRecipe?.framework ?? builderFramework;
	const packageManager = starterRecipe?.packageManager ?? builderPackageManager;
	const tailwind = starterRecipe?.tailwind ?? builderTailwind;
	const projectName = starterRecipe?.projectName ?? builderProjectName;

	const [state, setState] = useState<DeployState>({ step: 'auth-check' });
	const [repoName, setRepoName] = useState(projectName);
	const [isPrivate, setIsPrivate] = useState(false);
	const [countdown, setCountdown] = useState<number | null>(null);
	const [repoNameStatus, setRepoNameStatus] = useState<RepoNameStatus>('idle');
	const [repoNameError, setRepoNameError] = useState<string | null>(null);

	const providerInfo = provider ? PROVIDER_INFO[provider] : null;

	const trackDialogLinkClick = useCallback((
		action: 'repo' | 'provider_auto_redirect' | 'provider_manual_redirect',
	) => {
		const builderAction: BuilderAction =
			action === 'repo'
				? 'open_repo'
				: action === 'provider_auto_redirect'
					? 'provider_redirect_auto'
					: 'provider_redirect_manual';
		onTrackActivation?.({
			action: builderAction,
			surface: 'deploy_dialog',
			provider: provider ?? undefined,
			automatic: action === 'provider_auto_redirect',
		});
	}, [onTrackActivation, provider]);

	// Debounced repo name availability check
	const nameCheckDebouncer = useAsyncDebouncer(async (name: string) => {
		const result = await checkRepoNameAvailability(name);
		if (result.available) {
			setRepoNameStatus('available');
			setRepoNameError(null);
		} else {
			setRepoNameStatus('taken');
			setRepoNameError('Repository name already exists');
		}
	}, {
		wait: 500,
		onError: () => {
			// On error, reset to idle (don't block the user)
			setRepoNameStatus('idle');
			setRepoNameError(null);
		},
	});

	// Update repo name when project name changes
	useEffect(() => {
		setRepoName(projectName);
	}, [projectName]);

	// Validate and check repo name
	useEffect(() => {
		// Reset error
		setRepoNameError(null);

		// Validate format first
		const validation = validateRepoNameFormat(repoName);
		if (!validation.valid) {
			setRepoNameStatus(validation.error ? 'invalid' : 'idle');
			setRepoNameError(validation.error ?? null);
			return;
		}

		// Only check availability if authenticated with repo scope
		if (!auth.hasRepoScope) {
			setRepoNameStatus('idle');
			return;
		}

		setRepoNameStatus('checking');
		nameCheckDebouncer.maybeExecute(repoName);
	}, [repoName, auth.hasRepoScope]);

	// Refresh auth state when dialog opens
	useEffect(() => {
		if (isOpen) {
			auth.refresh();
		}
	}, [isOpen]);

	// Check auth state when dialog opens or auth changes
	useEffect(() => {
		if (!isOpen) {
			setState({ step: 'auth-check' });
			setCountdown(null);
			return;
		}

		if (auth.isLoading) {
			setState({ step: 'auth-check' });
			return;
		}

		if (!auth.authenticated || !auth.hasGitHubAccount || !auth.hasRepoScope) {
			setState({ step: 'needs-auth' });
			return;
		}

		setState({ step: 'form' });
	}, [isOpen, auth.isLoading, auth.authenticated, auth.hasGitHubAccount, auth.hasRepoScope]);

	// Auto-redirect countdown (only when there's a provider)
	useEffect(() => {
		if (state.step !== 'success' || countdown === null || !providerInfo) return;

		if (countdown <= 0) {
			// Redirect to provider deploy page
			setCountdown(null); // Prevent double-open
			const deployUrl = providerInfo.deployUrl(state.owner, state.repoName);
			trackDialogLinkClick('provider_auto_redirect');
			window.open(deployUrl, '_blank');
			return;
		}

		const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
		return () => clearTimeout(timer);
	}, [countdown, onClose, providerInfo, state, trackDialogLinkClick]);

	const handleDeploy = useCallback(async () => {
		setState({ step: 'deploying', message: 'Generating project...' });

		try {
			const files = await compileBuilderProject({
				name: projectName,
				framework,
				packageManager,
				tailwind,
				features,
				featureOptions,
			});

			setState({ step: 'deploying', message: 'Creating repository...' });

			const response = await fetch('/api/builder/deploy/github', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					repoName,
					isPrivate,
					projectName,
					framework,
					packageManager,
					features,
					featureOptions,
					tailwind,
					files,
				}),
			});

			const data = await response.json();

			if (!data.success) {
				setState({
					step: 'error',
					message: data.error ?? 'Deployment failed',
					code: data.code,
				});
				return;
			}

			setState({
				step: 'success',
				repoUrl: data.repoUrl,
				owner: data.owner,
				repoName: data.repoName,
			});
			// Only start countdown if there's a provider to redirect to
			if (providerInfo) {
				setCountdown(3);
			}
		} catch (error) {
			setState({
				step: 'error',
				message: error instanceof Error ? error.message : 'Deployment failed',
			});
		}
	}, [
		repoName,
		isPrivate,
		projectName,
		framework,
		packageManager,
		features,
		featureOptions,
		tailwind,
		providerInfo,
	]);

	if (!isOpen) return null;

	return <div class="fixed inset-0 z-50 flex items-center justify-center">
		{/* Backdrop */}
		<button
			type="button"
			class="absolute inset-0 bg-black/50 backdrop-blur-sm"
			onClick={onClose}
			aria-label="Close dialog"
		/>

		{/* Dialog */}
		<div
			class="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
		>
			{/* Header */}
			<div
				class="px-6 py-4 border-b border-gray-200 dark:border-gray-700"
				style={providerInfo ? { backgroundColor: `${providerInfo.color}10` } : undefined}
			>
				<div class="flex items-center gap-3">
					<div
						class={twMerge(
							'w-10 h-10 rounded-lg flex items-center justify-center',
							!providerInfo && 'bg-gray-800',
						)}
						style={providerInfo ? { backgroundColor: providerInfo.color } : undefined}
					>
						{providerInfo
							? <Rocket className="w-5 h-5 text-white" />
							: <GitHub className="w-5 h-5 text-white" />}
					</div>
					<div>
						<h2 class="text-lg font-semibold text-gray-900 dark:text-white">{(providerInfo
							? `Deploy to ${providerInfo.name}`
							: 'Create GitHub Repository') as string}</h2>
						<p class="text-sm text-gray-500 dark:text-gray-400">{(providerInfo
							? 'Create a GitHub repo and deploy'
							: 'Push your project to GitHub') as string}</p>
					</div>
				</div>
			</div>

			{/* Content */}
			<div class="p-6">
				{state.step === 'auth-check' &&
					<div class="flex flex-col items-center justify-center py-8">
						<Loader2 className="w-8 h-8 animate-spin text-gray-400" />
						<p class="mt-4 text-sm text-gray-500 dark:text-gray-400">
							Checking authentication...
						</p>
					</div>}

				{state.step === 'needs-auth' &&
					<div class="flex flex-col items-center text-center py-4">
						<div
							class="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4"
						>
							<GitHub className="w-8 h-8 text-gray-600 dark:text-gray-400" />
						</div>
						<h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
							GitHub Authorization Required
						</h3>
						<p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
							To deploy, we need permission to create repositories on your GitHub account.
						</p>
						<Button variant="primary" onClick={auth.redirectToGitHubAuth} className="gap-2">
							<GitHub className="w-4 h-4" />
							Connect GitHub
						</Button>
					</div>}

				{state.step === 'form' &&
					<div class="space-y-4">
						<div>
							<label
								htmlFor="repo-name"
								class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
							>
								Repository Name
							</label>
							<div class="relative">
								<input
									id="repo-name"
									type="text"
									value={repoName}
									onInput={(e) => setRepoName(e.target.value)}
									placeholder="my-tanstack-app"
									class={twMerge(
										'w-full px-3 py-2 pr-9 text-sm bg-white dark:bg-gray-800 border rounded-lg focus:outline-none focus:ring-2',
										repoNameStatus === 'taken' || repoNameStatus === 'invalid'
											? 'border-red-400 dark:border-red-500 focus:ring-red-500'
											: repoNameStatus === 'available'
												? 'border-green-400 dark:border-green-500 focus:ring-green-500'
												: 'border-gray-300 dark:border-gray-600 focus:ring-blue-500 dark:focus:ring-cyan-500',
									)}
								/>
								<div class="absolute right-2.5 top-1/2 -translate-y-1/2">
									{repoNameStatus === 'checking' &&
										<Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
									{repoNameStatus === 'available' && <Check className="w-4 h-4 text-green-500" />}
									{(repoNameStatus === 'taken' || repoNameStatus === 'invalid') &&
										<AlertCircle className="w-4 h-4 text-red-500" />}
								</div>
							</div>
							{repoNameError && <p class="mt-1 text-xs text-red-500">{repoNameError as string}</p>}
						</div>

						<div>
							<span class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
								Visibility
							</span>
							<div class="flex gap-2">
								<button
									onClick={() => setIsPrivate(false)}
									class={twMerge(
										'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors',
										!isPrivate
											? 'bg-blue-50 dark:bg-cyan-900/30 border-blue-500 dark:border-cyan-500 text-blue-700 dark:text-cyan-300'
											: 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700',
									)}
								>
									<Globe className="w-4 h-4" />
									Public
								</button>
								<button
									onClick={() => setIsPrivate(true)}
									class={twMerge(
										'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors',
										isPrivate
											? 'bg-blue-50 dark:bg-cyan-900/30 border-blue-500 dark:border-cyan-500 text-blue-700 dark:text-cyan-300'
											: 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700',
									)}
								>
									<Lock className="w-4 h-4" />
									Private
								</button>
							</div>
						</div>

						{features.length > 0 &&
							<div
								class="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg p-3"
							>
								<span class="font-medium">Integrations:</span>
								{features.join(', ') as string}
							</div>}

						<div class="flex gap-3 pt-2">
							<Button variant="secondary" onClick={onClose} className="flex-1">
								Cancel
							</Button>
							<Button
								variant="primary"
								onClick={handleDeploy}
								disabled={!repoName.trim() || repoNameStatus === 'taken' ||
									repoNameStatus === 'invalid' ||
									repoNameStatus === 'checking'}
								className="flex-1 gap-2"
							>
								<GitHub className="w-4 h-4" />
								{(providerInfo ? 'Create & Deploy' : 'Create Repository') as string}
							</Button>
						</div>
					</div>}

				{state.step === 'deploying' &&
					<div class="flex flex-col items-center justify-center py-8">
						<Loader2 className="w-8 h-8 animate-spin text-blue-500 dark:text-cyan-400" />
						<p class="mt-4 text-sm text-gray-600 dark:text-gray-400">{state.message as string}</p>
					</div>}

				{state.step === 'success' &&
					<div class="flex flex-col items-center text-center py-4">
						<div
							class="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4"
						>
							<Check className="w-8 h-8 text-green-600 dark:text-green-400" />
						</div>
						<h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
							Repository Created!
						</h3>
						<a
							href={state.repoUrl}
							target="_blank"
							rel="noopener noreferrer"
							onClick={() => {
								trackDialogLinkClick('repo');
							}}
							class="text-sm text-blue-600 dark:text-cyan-400 hover:underline flex items-center gap-1 mb-4"
						>
							{/* Upstream: `{state.owner}/{state.repoName}`. @tsrx/core@0.1.44 mis-tokenizes a
    literal `/` in JSX TEXT nested inside an expression container as a regex start
    ("Unterminated regular expression"), so the identical text is produced with a
    template literal until the parser is fixed. */}
							{`${state.owner}/${state.repoName}`}
							<ExternalLink className="w-3 h-3" />
						</a>
						{providerInfo
							? <>
									{countdown !== null && countdown > 0 &&
										<p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
											Redirecting to
											{providerInfo.name as string}
											in
											{countdown}
											s...
										</p>}
									{(() => {
										const deployUrl = providerInfo.deployUrl(state.owner, state.repoName);

										return <Button
											as="a"
											variant="primary"
											href={deployUrl}
											target="_blank"
											rel="noopener noreferrer"
											onClick={() => {
												setCountdown(null);
												trackDialogLinkClick('provider_manual_redirect');
											}}
											className="gap-2"
											style={{ backgroundColor: providerInfo.color }}
										>
											<Rocket className="w-4 h-4" />
											Deploy Now
										</Button>;
									})()}
								</>
							: <Button variant="secondary" onClick={onClose}>
									Done
								</Button>}
					</div>}

				{state.step === 'error' &&
					<div class="flex flex-col items-center text-center py-4">
						<div
							class="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4"
						>
							<AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
						</div>
						<h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
							Deployment Failed
						</h3>
						<p class="text-sm text-gray-500 dark:text-gray-400 mb-4">{state.message as string}</p>
						<div class="flex gap-3">
							<Button variant="secondary" onClick={onClose}>
								Cancel
							</Button>
							<Button variant="primary" onClick={() => setState({ step: 'form' })}>
								Try Again
							</Button>
						</div>
					</div>}
			</div>
		</div>
	</div>;
}
