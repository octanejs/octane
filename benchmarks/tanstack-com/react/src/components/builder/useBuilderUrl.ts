/**
 * Builder URL Sync Hook (v2)
 *
 * Bidirectional sync between URL search params and builder store.
 */

import { useEffect, useRef } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useDebouncedCallback } from '@tanstack/react-pacer';
import { useBuilderStore } from './store';
import type { FeatureId } from '~/builder/api';
import type { FrameworkId } from '~/builder/frameworks'; // Used in syncToUrl type

interface BuilderSearchParams {
	name?: string;
	framework?: string;
	template?: string; // template preset ID
	features?: string; // comma-separated feature IDs
	pm?: string; // package manager: pnpm, npm, yarn, bun
	tailwind?: string;
	// Feature options serialized as: featureId.optionKey=value
	[key: string]: string | undefined;
}

export function useBuilderUrl() {
	const navigate = useNavigate();
	const search = useSearch({ strict: false }) as BuilderSearchParams;
	const isSyncingFromUrl = useRef(false);

	const projectName = useBuilderStore((s) => s.projectName);
	const framework = useBuilderStore((s) => s.framework);
	const features = useBuilderStore((s) => s.features);
	const featureOptions = useBuilderStore((s) => s.featureOptions);
	const selectedTemplate = useBuilderStore((s) => s.selectedTemplate);
	const packageManager = useBuilderStore((s) => s.packageManager);
	const tailwind = useBuilderStore((s) => s.tailwind);
	const featuresLoaded = useBuilderStore((s) => s.featuresLoaded);
	const setProjectName = useBuilderStore((s) => s.setProjectName);
	const setFeatures = useBuilderStore((s) => s.setFeatures);
	const setFeatureOption = useBuilderStore((s) => s.setFeatureOption);
	const setTemplate = useBuilderStore((s) => s.setTemplate);
	const setPackageManager = useBuilderStore((s) => s.setPackageManager);
	const setTailwind = useBuilderStore((s) => s.setTailwind);

	// Initialize from URL on mount (only once when features load)
	const initializedRef = useRef(false);
	useEffect(() => {
		if (!featuresLoaded || initializedRef.current) return;
		initializedRef.current = true;

		isSyncingFromUrl.current = true;

		// Set project name
		if (search.name) {
			setProjectName(search.name);
		}

		// Set package manager
		if (search.pm && ['pnpm', 'npm', 'yarn', 'bun'].includes(search.pm)) {
			setPackageManager(search.pm as 'pnpm' | 'npm' | 'yarn' | 'bun');
		}

		if (search.tailwind === 'false') {
			setTailwind(false);
		}

		// Note: framework is set in BuilderProvider before features load

		// Apply template if specified (this sets features)
		if (search.template) {
			setTemplate(search.template);

			if (search.features) {
				const featureList = search.features.split(',').filter(Boolean) as Array<FeatureId>;

				setFeatures(Array.from(new Set([...useBuilderStore.getState().features, ...featureList])));
			}
		}
		// Otherwise set features from URL
		else if (search.features) {
			const featureList = search.features.split(',').filter(Boolean) as Array<FeatureId>;
			setFeatures(featureList);
		}

		// Set feature options (keys like "drizzle.database")
		for (const [key, value] of Object.entries(search)) {
			if (key.includes('.') && value) {
				const [featureId, optionKey] = key.split('.');
				setFeatureOption(featureId as FeatureId, optionKey, value);
			}
		}

		// Allow state changes to trigger URL sync after initial load
		setTimeout(() => {
			isSyncingFromUrl.current = false;
		}, 100);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [featuresLoaded]);

	// Debounced URL sync to avoid lag when typing
	const syncToUrl = useDebouncedCallback(
		(
			name: string,
			fw: FrameworkId,
			feats: Array<FeatureId>,
			opts: Record<string, Record<string, unknown>>,
			template: string | null,
			pm: string,
			hasTailwind: boolean,
		) => {
			navigate({
				to: '/builder',
				search: (prev: any) => {
					const params: Record<string, unknown> = { ...prev };

					// Update project name
					if (name && name !== 'my-tanstack-app') {
						params.name = name;
					} else {
						delete params.name;
					}

					// Update framework (skip if default react)
					if (fw && fw !== 'react') {
						params.framework = fw;
					} else {
						delete params.framework;
					}

					// Update template (skip if blank)
					if (template && template !== 'blank') {
						params.template = template;
					} else {
						delete params.template;
					}

					// Update package manager (skip if default pnpm)
					if (pm && pm !== 'pnpm') {
						params.pm = pm;
					} else {
						delete params.pm;
					}

					if (!hasTailwind) {
						params.tailwind = 'false';
					} else {
						delete params.tailwind;
					}

					// Update features
					if (feats.length > 0) {
						params.features = feats.join(',');
					} else {
						delete params.features;
					}

					// Clear old feature options (keys with dots)
					for (const key of Object.keys(params)) {
						if (key.includes('.')) {
							delete params[key];
						}
					}

					// Serialize current feature options
					for (const [featureId, options] of Object.entries(opts)) {
						for (const [optionKey, value] of Object.entries(options)) {
							if (value !== undefined && value !== null) {
								params[`${featureId}.${optionKey}`] = String(value);
							}
						}
					}

					return params;
				},
				replace: true,
			});
		},
		{ wait: 300 },
	);

	// Sync state changes to URL (debounced)
	useEffect(() => {
		if (!featuresLoaded || isSyncingFromUrl.current) return;
		syncToUrl(
			projectName,
			framework,
			features,
			featureOptions,
			selectedTemplate,
			packageManager,
			tailwind,
		);
	}, [
		projectName,
		framework,
		features,
		featureOptions,
		selectedTemplate,
		packageManager,
		tailwind,
		featuresLoaded,
		syncToUrl,
	]);
}

/**
 * Generate CLI command from current state
 */
export function useCliCommand(): string {
	const projectName = useBuilderStore((s) => s.projectName);
	const framework = useBuilderStore((s) => s.framework);
	const features = useBuilderStore((s) => s.features);
	const featureOptions = useBuilderStore((s) => s.featureOptions);
	const selectedExample = useBuilderStore((s) => s.selectedExample);
	const availableExamples = useBuilderStore((s) => s.availableExamples);
	const tailwind = useBuilderStore((s) => s.tailwind);
	const packageManager = useBuilderStore((s) => s.packageManager);
	const skipInstall = useBuilderStore((s) => s.skipInstall);
	const skipGit = useBuilderStore((s) => s.skipGit);

	let cmd = `npx @tanstack/cli@latest create ${projectName}`;
	cmd += ' --agent';

	// Map internal framework ID to CLI framework name
	if (framework === 'solid') {
		cmd += ' --framework Solid';
	}

	cmd += ` --package-manager ${packageManager}`;

	if (tailwind) {
		cmd += ' --tailwind';
	} else {
		cmd += ' --no-tailwind';
	}

	if (selectedExample) {
		cmd += ` --template ${selectedExample}`;
	}

	// Skip add-ons that the selected example will pull in via dependsOn
	const exampleLockedFeatures = selectedExample
		? new Set(availableExamples.find((e) => e.id === selectedExample)?.requires ?? [])
		: new Set<string>();
	const addOnFeatures = features.filter((f) => !exampleLockedFeatures.has(f));

	if (addOnFeatures.length > 0) {
		cmd += ` --add-ons ${addOnFeatures.join(',')}`;
	}

	const addOnConfigEntries = Object.entries(featureOptions).filter(
		([, options]) => options && Object.keys(options).length > 0,
	);
	if (addOnConfigEntries.length > 0) {
		const json = JSON.stringify(Object.fromEntries(addOnConfigEntries));
		cmd += ` --add-on-config '${json.replace(/'/g, `'\\''`)}'`;
	}

	if (skipInstall) {
		cmd += ' --no-install';
	}

	if (skipGit) {
		cmd += ' --no-git';
	}

	return cmd;
}
