import { useLocalCurrentFramework } from '../FrameworkSelect';
import { useCurrentUserQuery } from '~/hooks/useCurrentUser';
import { useParams } from '@tanstack/react-router';
import * as React from 'react';
import { Tabs, type TabDefinition } from './Tabs';
import { createPersistedEnumStore } from './usePersistedEnumStore';
import type { Framework } from '~/libraries/types';
import {
	PACKAGE_MANAGERS,
	isPackageManager,
	type PackageManager,
} from '~/utils/markdown/installCommand';

const DEFAULT_PACKAGE_MANAGER: PackageManager = 'npm';

const packageManagerStore = createPersistedEnumStore<PackageManager>({
	storageKey: 'packageManager',
	values: PACKAGE_MANAGERS,
	defaultValue: DEFAULT_PACKAGE_MANAGER,
});

type PackageManagerTabsProps = {
	children?: React.ReactNode;
};

function isPackageManagerPanel(child: React.ReactNode): child is React.ReactElement<{
	'data-framework': string;
	'data-package-manager': string;
	children?: React.ReactNode;
}> {
	return (
		React.isValidElement<{
			'data-framework'?: string;
			'data-package-manager'?: string;
		}>(child) &&
		typeof child.props['data-framework'] === 'string' &&
		typeof child.props['data-package-manager'] === 'string'
	);
}

export function PackageManagerTabs({ children }: PackageManagerTabsProps) {
	packageManagerStore.useHydrate();

	const storedPackageManager = packageManagerStore((s) => s.value);
	const setPackageManager = packageManagerStore((s) => s.setValue);

	const { framework: paramsFramework } = useParams({ strict: false });
	const localCurrentFramework = useLocalCurrentFramework();
	const userQuery = useCurrentUserQuery();
	const userFramework = userQuery.data?.lastUsedFramework;

	const actualFramework = (paramsFramework ||
		userFramework ||
		localCurrentFramework.currentFramework ||
		'react') as Framework;

	const normalizedFramework = actualFramework.toLowerCase();
	const panels = React.Children.toArray(children).filter(isPackageManagerPanel);
	const availableFramework = panels.find((child) => {
		return child.props['data-framework'] === normalizedFramework;
	})
		? normalizedFramework
		: panels[0]?.props['data-framework'];
	const packageManagerPanels = panels.filter((child) => {
		return child.props['data-framework'] === availableFramework;
	});

	const handleTabChange = React.useCallback(
		(slug: string) => {
			if (isPackageManager(slug)) {
				setPackageManager(slug);
			}
		},
		[setPackageManager],
	);

	if (!packageManagerPanels.length) {
		return null;
	}

	const selectedPackageManager = isPackageManager(storedPackageManager)
		? storedPackageManager
		: PACKAGE_MANAGERS[0];

	const tabs: Array<TabDefinition> = packageManagerPanels.map((panel) => {
		const packageManager = panel.props['data-package-manager'] as PackageManager;

		return {
			slug: packageManager,
			name: packageManager,
			headers: [],
		};
	});

	return (
		<div className="package-manager-tabs">
			<Tabs
				tabs={tabs}
				activeSlug={selectedPackageManager}
				onTabChange={handleTabChange}
				panelContent="code-only"
			>
				{packageManagerPanels.map((panel) => panel.props.children)}
			</Tabs>
		</div>
	);
}
