/**
 * Example Deploy Dialog Component
 *
 * Dialog for deploying a library example to GitHub and then to a cloud provider.
 * Based on the builder's DeployDialog but fetches example files instead of compiling.
 */

import { useState, useEffect, useCallback } from 'react';
import { Loader2, ExternalLink, AlertCircle, Check, Lock, Globe, Rocket } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { useAsyncDebouncer } from '@tanstack/react-pacer';
import { Button, GitHub } from '~/ui';
import { useDeployAuth } from './builder/useDeployAuth';
import {
	type DeployProvider,
	type DeployState,
	type RepoNameStatus,
	PROVIDER_INFO,
	checkRepoNameAvailability,
	validateRepoNameFormat,
} from './deploy/shared';

export type { DeployProvider };

interface ExampleDeployDialogProps {
	isOpen: boolean;
	onClose: () => void;
	provider: DeployProvider;
	repo: string;
	branch: string;
	examplePath: string;
	exampleName: string;
	libraryName: string;
}

function generateDefaultRepoName(examplePath: string): string {
	const parts = examplePath.split('/');
	return parts[parts.length - 1] || 'my-tanstack-app';
}

export function ExampleDeployDialog({
	isOpen,
	onClose,
	provider,
	repo,
	branch,
	examplePath,
	exampleName,
	libraryName,
}: ExampleDeployDialogProps) {
	const auth = useDeployAuth();
	const providerInfo = PROVIDER_INFO[provider];

	const defaultRepoName = generateDefaultRepoName(examplePath);
	const [state, setState] = useState<DeployState>({ step: 'auth-check' });
	const [repoName, setRepoName] = useState(defaultRepoName);
	const [isPrivate, setIsPrivate] = useState(false);
	const [countdown, setCountdown] = useState<number | null>(null);
	const [repoNameStatus, setRepoNameStatus] = useState<RepoNameStatus>('idle');
	const [repoNameError, setRepoNameError] = useState<string | null>(null);

	// Debounced repo name availability check
	const nameCheckDebouncer = useAsyncDebouncer(
		async (name: string) => {
			const result = await checkRepoNameAvailability(name);
			if (result.available) {
				setRepoNameStatus('available');
				setRepoNameError(null);
			} else {
				setRepoNameStatus('taken');
				setRepoNameError('Repository name already exists');
			}
		},
		{
			wait: 500,
			onError: () => {
				setRepoNameStatus('idle');
				setRepoNameError(null);
			},
		},
	);

	// Reset repo name when dialog opens with new example
	useEffect(() => {
		if (isOpen) {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setRepoName(defaultRepoName);
		}
	}, [isOpen, defaultRepoName]);

	// Validate and check repo name
	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setRepoNameError(null);

		const validation = validateRepoNameFormat(repoName);
		if (!validation.valid) {
			setRepoNameStatus(validation.error ? 'invalid' : 'idle');
			setRepoNameError(validation.error ?? null);
			return;
		}

		if (!auth.hasRepoScope) {
			setRepoNameStatus('idle');
			return;
		}

		setRepoNameStatus('checking');
		nameCheckDebouncer.maybeExecute(repoName);
	}, [repoName, auth.hasRepoScope]); // eslint-disable-line react-hooks/exhaustive-deps

	// Refresh auth state when dialog opens
	useEffect(() => {
		if (isOpen) {
			auth.refresh();
		}
	}, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

	// Check auth state when dialog opens or auth changes
	useEffect(() => {
		if (!isOpen) {
			// eslint-disable-next-line react-hooks/set-state-in-effect
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

	// Auto-redirect countdown
	useEffect(() => {
		if (state.step !== 'success' || countdown === null) return;

		if (countdown <= 0) {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setCountdown(null);
			const deployUrl = providerInfo.deployUrl(state.owner, state.repoName);
			window.open(deployUrl, '_blank');
			return;
		}

		const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
		return () => clearTimeout(timer);
	}, [state, countdown, providerInfo]);

	const handleDeploy = useCallback(async () => {
		setState({ step: 'deploying', message: 'Fetching example files...' });

		try {
			const response = await fetch('/api/example/deploy', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					repoName,
					isPrivate,
					sourceRepo: repo,
					branch,
					examplePath,
					provider,
					libraryName,
					exampleName,
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
			setCountdown(3);
		} catch (error) {
			setState({
				step: 'error',
				message: error instanceof Error ? error.message : 'Deployment failed',
			});
		}
	}, [repoName, isPrivate, repo, branch, examplePath, provider, libraryName, exampleName]);

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			{/* Backdrop */}
			<button
				type="button"
				className="absolute inset-0 bg-black/50 backdrop-blur-sm"
				onClick={onClose}
				aria-label="Close dialog"
			/>

			{/* Dialog */}
			<div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
				{/* Header */}
				<div
					className="px-6 py-4 border-b border-gray-200 dark:border-gray-700"
					style={{ backgroundColor: `${providerInfo.color}10` }}
				>
					<div className="flex items-center gap-3">
						<div
							className="w-10 h-10 rounded-lg flex items-center justify-center"
							style={{ backgroundColor: providerInfo.color }}
						>
							<Rocket className="w-5 h-5 text-white" />
						</div>
						<div>
							<h2 className="text-lg font-semibold text-gray-900 dark:text-white">
								Deploy to {providerInfo.name}
							</h2>
							<p className="text-sm text-gray-500 dark:text-gray-400">{exampleName}</p>
						</div>
					</div>
				</div>

				{/* Content */}
				<div className="p-6">
					{state.step === 'auth-check' && (
						<div className="flex flex-col items-center justify-center py-8">
							<Loader2 className="w-8 h-8 animate-spin text-gray-400" />
							<p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
								Checking authentication...
							</p>
						</div>
					)}

					{state.step === 'needs-auth' && (
						<div className="flex flex-col items-center text-center py-4">
							<div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
								<GitHub className="w-8 h-8 text-gray-600 dark:text-gray-400" />
							</div>
							<h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
								GitHub Authorization Required
							</h3>
							<p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
								To deploy this example, we need permission to create a repository on your GitHub
								account.
							</p>
							<Button variant="primary" onClick={auth.redirectToGitHubAuth} className="gap-2">
								<GitHub className="w-4 h-4" />
								Connect GitHub
							</Button>
						</div>
					)}

					{state.step === 'form' && (
						<div className="space-y-4">
							<div>
								<label
									htmlFor="repo-name"
									className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
								>
									Repository Name
								</label>
								<div className="relative">
									<input
										id="repo-name"
										type="text"
										value={repoName}
										onChange={(e) => setRepoName(e.target.value)}
										placeholder="my-tanstack-app"
										className={twMerge(
											'w-full px-3 py-2 pr-9 text-sm bg-white dark:bg-gray-800 border rounded-lg focus:outline-none focus:ring-2',
											repoNameStatus === 'taken' || repoNameStatus === 'invalid'
												? 'border-red-400 dark:border-red-500 focus:ring-red-500'
												: repoNameStatus === 'available'
													? 'border-green-400 dark:border-green-500 focus:ring-green-500'
													: 'border-gray-300 dark:border-gray-600 focus:ring-blue-500 dark:focus:ring-cyan-500',
										)}
									/>
									<div className="absolute right-2.5 top-1/2 -translate-y-1/2">
										{repoNameStatus === 'checking' && (
											<Loader2 className="w-4 h-4 animate-spin text-gray-400" />
										)}
										{repoNameStatus === 'available' && <Check className="w-4 h-4 text-green-500" />}
										{(repoNameStatus === 'taken' || repoNameStatus === 'invalid') && (
											<AlertCircle className="w-4 h-4 text-red-500" />
										)}
									</div>
								</div>
								{repoNameError && <p className="mt-1 text-xs text-red-500">{repoNameError}</p>}
							</div>

							<div>
								<span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
									Visibility
								</span>
								<div className="flex gap-2">
									<button
										onClick={() => setIsPrivate(false)}
										className={twMerge(
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
										className={twMerge(
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

							<div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
								<span className="font-medium">Source: </span>
								{libraryName} / {examplePath}
							</div>

							<div className="flex gap-3 pt-2">
								<Button variant="secondary" onClick={onClose} className="flex-1">
									Cancel
								</Button>
								<Button
									variant="primary"
									onClick={handleDeploy}
									disabled={
										!repoName.trim() ||
										repoNameStatus === 'taken' ||
										repoNameStatus === 'invalid' ||
										repoNameStatus === 'checking'
									}
									className="flex-1 gap-2"
								>
									<GitHub className="w-4 h-4" />
									Create & Deploy
								</Button>
							</div>
						</div>
					)}

					{state.step === 'deploying' && (
						<div className="flex flex-col items-center justify-center py-8">
							<Loader2 className="w-8 h-8 animate-spin text-blue-500 dark:text-cyan-400" />
							<p className="mt-4 text-sm text-gray-600 dark:text-gray-400">{state.message}</p>
						</div>
					)}

					{state.step === 'success' && (
						<div className="flex flex-col items-center text-center py-4">
							<div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
								<Check className="w-8 h-8 text-green-600 dark:text-green-400" />
							</div>
							<h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
								Repository Created!
							</h3>
							<a
								href={state.repoUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="text-sm text-blue-600 dark:text-cyan-400 hover:underline flex items-center gap-1 mb-4"
							>
								{state.owner}/{state.repoName}
								<ExternalLink className="w-3 h-3" />
							</a>
							{countdown !== null && countdown > 0 && (
								<p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
									Redirecting to {providerInfo.name} in {countdown}s...
								</p>
							)}
							<Button
								variant="primary"
								onClick={() => {
									setCountdown(null);
									const deployUrl = providerInfo.deployUrl(state.owner, state.repoName);
									window.open(deployUrl, '_blank');
								}}
								className="gap-2"
								style={{ backgroundColor: providerInfo.color }}
							>
								<Rocket className="w-4 h-4" />
								Deploy Now
							</Button>
						</div>
					)}

					{state.step === 'error' && (
						<div className="flex flex-col items-center text-center py-4">
							<div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
								<AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
							</div>
							<h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
								Deployment Failed
							</h3>
							<p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{state.message}</p>
							<div className="flex gap-3">
								<Button variant="secondary" onClick={onClose}>
									Cancel
								</Button>
								<Button variant="primary" onClick={() => setState({ step: 'form' })}>
									Try Again
								</Button>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
