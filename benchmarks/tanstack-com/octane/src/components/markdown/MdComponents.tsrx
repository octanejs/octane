import { Children, Fragment, isValidElement } from 'octane';
import { FileTabs } from './FileTabs.tsrx';
import { FrameworkContent } from './FrameworkContent.tsrx';
import { PackageManagerTabs } from './PackageManagerTabs.tsrx';
import { BundlerTabs } from './BundlerTabs.tsrx';
import { CodeBlock } from './CodeBlock.tsrx';
import { Tabs } from './Tabs.tsrx';
import {
	getInstallCommand,
	PACKAGE_MANAGERS,
	type InstallMode,
} from '~/utils/markdown/installCommand';

function parseJson(value: string | undefined) {
	if (!value) {
		return null;
	}

	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

type TabMeta = {
	name: string;
	slug: string;
};

function getTabs(value: unknown): Array<TabMeta> {
	if (!isRecord(value) || !Array.isArray(value.tabs)) {
		return [];
	}

	return value.tabs.filter(
		(tab): tab is TabMeta => isRecord(tab) && typeof tab.name === 'string' &&
			typeof tab.slug === 'string',
	);
}

function isPackageGroups(value: unknown): value is string[][] {
	return Array.isArray(value) &&
		value.every(
			(group) => Array.isArray(group) &&
				group.every((packageName) => typeof packageName === 'string'),
		);
}

function isInstallMode(value: unknown): value is InstallMode {
	return value === 'install' || value === 'dev-install' || value === 'local-install' ||
		value === 'create' ||
		value === 'custom';
}

type PackageManagerMeta = {
	mode: InstallMode;
	packagesByFramework: Record<string, string[][]>;
};

function getPackageManagerMeta(value: unknown): PackageManagerMeta | null {
	if (!isRecord(value) || !isInstallMode(value.mode)) {
		return null;
	}

	const rawPackagesByFramework = value.packagesByFramework;
	if (!isRecord(rawPackagesByFramework)) {
		return null;
	}

	const packagesByFramework: Record<string, string[][]> = {};

	for (const [framework, packageGroups] of Object.entries(rawPackagesByFramework)) {
		if (!isPackageGroups(packageGroups)) {
			return null;
		}

		packagesByFramework[framework] = packageGroups;
	}

	return {
		mode: value.mode,
		packagesByFramework,
	};
}

type MdCommentComponentProps = {
	'data-attributes'?: string;
	'data-component'?: string;
	'data-files-meta'?: string;
	'data-package-manager-meta'?: string;
	'data-bundler-meta'?: string;
	preserveTabPanels?: boolean;
	children?: any;
};

function isMdTabPanelElement(child: any): child is { props: MdTabPanelProps; type: unknown } {
	return isValidElement(child) &&
		((child as any).type === MdTabPanel || (child as any).type === 'md-tab-panel');
}

function isMdFrameworkPanelElement(child: any): child is {
	props: MdFrameworkPanelProps;
	type: unknown;
} {
	return isValidElement(child) &&
		((child as any).type === MdFrameworkPanel || (child as any).type === 'md-framework-panel');
}

function renderPanelChildren(
	panels: Array<{ props: MdTabPanelProps }>,
	preserveTabPanels: boolean,
) {
	return panels.map((panel, index) => {
		if (!preserveTabPanels) {
			return panel.props.children;
		}

		return <Fragment key={index}>{panel.props.children}</Fragment>;
	});
}

export function MdCommentComponent({
	'data-attributes': rawAttributes,
	'data-component': componentName,
	'data-files-meta': filesMeta,
	'data-package-manager-meta': packageManagerMeta,
	'data-bundler-meta': bundlerMeta,
	preserveTabPanels = false,
	children,
}: MdCommentComponentProps) {
	const parsedAttributes = parseJson(rawAttributes);
	const attributes =
		parsedAttributes && typeof parsedAttributes === 'object' ? parsedAttributes : {};

	const normalizedComponentName = componentName?.toLowerCase();

	if (normalizedComponentName === 'tabs') {
		const parsedPackageManagerMeta = parseJson(packageManagerMeta);
		const resolvedPackageManagerMeta = getPackageManagerMeta(parsedPackageManagerMeta);

		if (resolvedPackageManagerMeta) {
			const frameworkPanels = Object.entries(
				resolvedPackageManagerMeta.packagesByFramework,
			).flatMap(([framework, packageGroups]) => {
				return PACKAGE_MANAGERS.map((packageManager) => {
					const commandText = getInstallCommand(
						packageManager,
						packageGroups,
						resolvedPackageManagerMeta.mode,
					).join('\n');

					return <div
						key={`${framework}-${packageManager}`}
						data-framework={framework}
						data-package-manager={packageManager}
					>
						<CodeBlock>
							<code className="language-bash">{commandText}</code>
						</CodeBlock>
					</div>;
				});
			});

			return <PackageManagerTabs>{frameworkPanels}</PackageManagerTabs>;
		}

		const childArray = Children.toArray(children);
		const panels = childArray.filter(isMdTabPanelElement);

		const parsedBundlerMeta = parseJson(bundlerMeta);

		if (parsedBundlerMeta && typeof parsedBundlerMeta === 'object' && panels.length) {
			const tabs = getTabs(attributes);

			const panelContent: Record<string, 'code-only' | 'mixed'> = {};
			const childrenBySlug = new Map<string, any>();
			panels.forEach((panel, index) => {
				const slug = panel.props['data-tab-slug'];
				if (!slug) return;
				const content = panel.props['data-content'];
				if (content === 'code-only' || content === 'mixed') {
					panelContent[slug] = content;
				}
				childrenBySlug.set(slug, panel.props.children);
				// Preserve insertion order for tabs that came in without metadata
				void index;
			});

			return <BundlerTabs tabs={tabs} panelContent={panelContent}>{tabs.map(
				(tab) => <Fragment key={tab.slug}>{childrenBySlug.get(tab.slug)}</Fragment>,
			)}</BundlerTabs>;
		}

		const parsedFilesMeta = parseJson(filesMeta);

		if (parsedFilesMeta && typeof parsedFilesMeta === 'object' && panels.length) {
			const tabs = getTabs(attributes);

			return <FileTabs tabs={tabs}>{renderPanelChildren(panels, preserveTabPanels)}</FileTabs>;
		}

		const tabs = getTabs(attributes);

		if (!tabs.length) {
			return <div>{children}</div>;
		}

		return <Tabs tabs={tabs}>{renderPanelChildren(panels, preserveTabPanels)}</Tabs>;
	}

	if (normalizedComponentName === 'framework') {
		return <MdFrameworkComponentInner>{children}</MdFrameworkComponentInner>;
	}

	return <div>{children}</div>;
}

type MdTabPanelProps = {
	'data-tab-slug'?: string;
	'data-tab-index'?: string;
	'data-content'?: 'code-only' | 'mixed';
	children?: any;
};

export function MdTabPanel({ children }: MdTabPanelProps) {
	return <>
		{children}
	</>;
}

type MdFrameworkPanelProps = {
	'data-framework'?: string;
	children?: any;
};

export function MdFrameworkPanel({ children }: MdFrameworkPanelProps) {
	return <>
		{children}
	</>;
}

function MdFrameworkComponentInner({ children }: { children?: any }) {
	const frameworkPanels: Array<any> = [];

	for (const child of Children.toArray(children)) {
		if (!isMdFrameworkPanelElement(child)) {
			continue;
		}

		const framework = child.props['data-framework'];
		if (!framework) {
			continue;
		}

		frameworkPanels.push(
			<div key={framework} data-framework={framework}>{child.props.children}</div>,
		);
	}

	if (!frameworkPanels.length) {
		return <div>{children}</div>;
	}

	return <FrameworkContent>{frameworkPanels}</FrameworkContent>;
}
