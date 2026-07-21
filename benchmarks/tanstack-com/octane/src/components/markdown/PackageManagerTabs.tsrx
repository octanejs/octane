import { useLocalCurrentFramework } from '../FrameworkSelect.tsrx';
import { useCurrentUserQuery } from '~/hooks/useCurrentUser';
import { useParams } from '@octanejs/tanstack-router';
import { Children, isValidElement, useCallback } from 'octane';
import { Tabs, type TabDefinition } from './Tabs.tsrx';
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
	children?: any;
};

function isPackageManagerPanel(child: any): child is {
	props: {
		'data-framework': string;
		'data-package-manager': string;
		children?: any;
	};
} {
	return isValidElement(child) && typeof (child as any).props['data-framework'] === 'string' &&
		typeof (child as any).props['data-package-manager'] === 'string';
}

export function PackageManagerTabs({ children }: PackageManagerTabsProps) {
	packageManagerStore.useHydrate();

	const storedPackageManager = packageManagerStore((s) => s.value);
	const setPackageManager = packageManagerStore((s) => s.setValue);

	const { framework: paramsFramework } = useParams({ strict: false });
	const localCurrentFramework = useLocalCurrentFramework();
	const userQuery = useCurrentUserQuery();
	const userFramework = userQuery.data?.lastUsedFramework;

	const actualFramework =
		paramsFramework || userFramework || localCurrentFramework.currentFramework ||
			'react' as Framework;

	const normalizedFramework = actualFramework.toLowerCase();
	const panels = Children.toArray(children).filter(isPackageManagerPanel);
	const availableFramework =
		panels.find((child) => {
			return child.props['data-framework'] === normalizedFramework;
		}) ? normalizedFramework : panels[0]?.props['data-framework'];
	const packageManagerPanels = panels.filter((child) => {
		return child.props['data-framework'] === availableFramework;
	});

	const handleTabChange = useCallback((slug: string) => {
		if (isPackageManager(slug)) {
			setPackageManager(slug);
		}
	}, [setPackageManager]);

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

	return <div class="package-manager-tabs">
		<Tabs
			tabs={tabs}
			activeSlug={selectedPackageManager}
			onTabChange={handleTabChange}
			panelContent="code-only"
		>{packageManagerPanels.map((panel) => panel.props.children)}</Tabs>
	</div>;
}
