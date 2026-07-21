import { useCallback, useEffect, useMemo } from 'octane';
import { create } from '@octanejs/zustand';
import { useNavigate, useParams } from '@octanejs/tanstack-router';
import { useQueryClient } from '@octanejs/tanstack-query';
import { Select } from './Select.tsrx';
import { type Framework, getLibrary, type LibraryId } from '~/libraries';
import { getFrameworkOptions } from '~/libraries/frameworks';
import { currentUserQueryOptions, useCurrentUserQuery } from '~/hooks/useCurrentUser';
import { updateLastUsedFramework } from '~/utils/users.functions';
import { getLocalStorageItem, setLocalStorageItem } from '~/utils/browser-storage';

function persistFrameworkToServer(framework: string) {
	void updateLastUsedFramework({ data: { framework } }).catch(() => {
		// Silently ignore errors - localStorage is the fallback
	});
}

export function FrameworkSelect({ libraryId }: { libraryId: LibraryId }) {
	const library = getLibrary(libraryId);
	const frameworkConfig = useFrameworkConfig({
		frameworks: library.frameworks,
	});
	const selectedFramework = frameworkConfig.available.find(
		(f) => f.value === frameworkConfig.selected,
	);
	return <Select
		className="w-full"
		icon={selectedFramework?.logo
			? <img src={selectedFramework.logo} alt={selectedFramework.label} class="w-4 h-4" />
			: undefined}
		selected={frameworkConfig.selected}
		available={frameworkConfig.available}
		onSelect={frameworkConfig.onSelect}
	/>;
}

// Let's use zustand to wrap the local storage logic. This way
// we'll get subscriptions for free and we can use it in other
// components if we need to.
export const useLocalCurrentFramework = create<{
	currentFramework?: string;
	setCurrentFramework: (framework: string) => void;
}>(
	(set) => ({
		currentFramework: getLocalStorageItem('framework') || undefined,
		setCurrentFramework: (framework: string) => {
			setLocalStorageItem('framework', framework);
			set({ currentFramework: framework });
		},
	}),
);

/**
 * Get the stored framework preference from localStorage.
 * Safe to call during SSR (returns undefined).
 */
export function getStoredFrameworkPreference(): string | undefined {
	return getLocalStorageItem('framework') || undefined;
}

/**
 * Hook to persist framework preference.
 * Saves to localStorage always, and to DB if user is logged in.
 */
export function usePersistFrameworkPreference() {
	const userQuery = useCurrentUserQuery();
	const queryClient = useQueryClient();
	const localCurrentFramework = useLocalCurrentFramework();

	return useCallback((framework: string) => {
		// Always update localStorage as fallback
		localCurrentFramework.setCurrentFramework(framework);
		queryClient.setQueryData(
			currentUserQueryOptions.queryKey,
			(user) => user ? { ...user, lastUsedFramework: framework } : user,
		);
		// Update DB for logged-in users (fire-and-forget)
		if (userQuery.data) {
			persistFrameworkToServer(framework);
		}
	}, [localCurrentFramework, queryClient, userQuery.data]);
}

function useFrameworkConfig({ frameworks }: { frameworks: Framework[] }) {
	const currentFramework = useCurrentFramework(frameworks);

	const frameworkConfig = useMemo(() => {
		return {
			label: 'Framework',
			selected: frameworks.includes(currentFramework.framework)
				? currentFramework.framework
				: 'react',
			available: getFrameworkOptions(frameworks),
			onSelect: (option: { label: string; value: string }) => {
				currentFramework.setFramework(option.value);
			},
		};
	}, [frameworks, currentFramework]);

	return frameworkConfig;
}

/**
 * Use framework in URL path
 * Otherwise use framework from user's DB preference (if logged in)
 * Otherwise use framework in localStorage if it exists for this project
 * Otherwise fallback to react
 */
export function useCurrentFramework(frameworks: Framework[]) {
	const navigate = useNavigate();
	const userQuery = useCurrentUserQuery();
	const queryClient = useQueryClient();

	const { framework: paramsFramework } = useParams({
		strict: false,
	});

	const localCurrentFramework = useLocalCurrentFramework();

	// Priority: URL params > DB (logged-in) > localStorage > 'react'
	const userFramework = userQuery.data?.lastUsedFramework;
	let framework =
		paramsFramework || userFramework || localCurrentFramework.currentFramework ||
			'react' as Framework;

	framework = frameworks.includes(framework) ? framework : 'react';

	const setFramework = useCallback((framework: string) => {
		navigate({
			params: { framework } as any,
		});
		// Always update localStorage as fallback
		localCurrentFramework.setCurrentFramework(framework);
		queryClient.setQueryData(
			currentUserQueryOptions.queryKey,
			(user) => user ? { ...user, lastUsedFramework: framework } : user,
		);

		// Update DB for logged-in users (fire-and-forget)
		if (userQuery.data) {
			persistFrameworkToServer(framework);
		}
	}, [localCurrentFramework, navigate, queryClient, userQuery.data]);

	// NOTE: the react flavor passes NO dependency argument here (run after every
	// render). Octane infers dependencies when the argument is omitted, so the
	// explicit `null` is required to keep React's every-render semantics.
	useEffect(() => {
		// Set the framework in localStorage if it doesn't exist
		if (!localCurrentFramework.currentFramework) {
			localCurrentFramework.setCurrentFramework(framework);
		}

		// Set the framework in localStorage if it doesn't match the URL
		if (paramsFramework && paramsFramework !== localCurrentFramework.currentFramework) {
			localCurrentFramework.setCurrentFramework(paramsFramework);
		}
	}, null);

	return {
		framework,
		setFramework,
	};
}
