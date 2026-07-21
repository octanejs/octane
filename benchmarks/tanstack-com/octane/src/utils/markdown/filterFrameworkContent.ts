/**
 * Filters framework-specific content blocks from raw markdown.
 *
 * Handles two types of blocks:
 *
 * 1. Framework blocks:
 *   <!-- ::start:framework -->
 *   # React
 *   React-specific content...
 *   # Vue
 *   Vue-specific content...
 *   <!-- ::end:framework -->
 *
 * 2. Package manager tabs (variant="package-manager"):
 *   <!-- ::start:tabs variant="package-manager" mode="local-install" -->
 *   react: create-tsrouter-app@latest my-app
 *   solid: create-tsrouter-app@latest my-app --framework solid
 *   <!-- ::end:tabs -->
 */

import { getInstallCommand, type PackageManager, type InstallMode } from './installCommand';

type FilterOptions = {
	framework?: string;
	packageManager?: PackageManager;
	/** Whether to keep the surrounding comment markers when filtering. Defaults to false. */
	keepMarkers?: boolean;
};

export function extractFrameworksFromMarkdown(markdown: string): Array<string> {
	const frameworks: Array<string> = [];
	const seen = new Set<string>();

	const addFramework = (framework: string) => {
		const normalizedFramework = framework.trim().toLowerCase();
		if (!normalizedFramework || seen.has(normalizedFramework)) {
			return;
		}

		seen.add(normalizedFramework);
		frameworks.push(normalizedFramework);
	};

	const frameworkBlockRegex =
		/<!--\s*::start:framework\s*-->([\s\S]*?)<!--\s*::end:framework\s*-->/gi;
	let frameworkBlockMatch: RegExpExecArray | null;

	while ((frameworkBlockMatch = frameworkBlockRegex.exec(markdown)) !== null) {
		for (const section of splitByFrameworkHeadings(frameworkBlockMatch[1] ?? '')) {
			addFramework(section.framework);
		}
	}

	const tabsBlockRegex = /<!--\s*::start:tabs\s+([^>]*?)-->([\s\S]*?)<!--\s*::end:tabs\s*-->/gi;
	let tabsBlockMatch: RegExpExecArray | null;

	while ((tabsBlockMatch = tabsBlockRegex.exec(markdown)) !== null) {
		const attrs = tabsBlockMatch[1] ?? '';
		const variant = parseAttribute(attrs, 'variant');
		if (variant !== 'package-manager' && variant !== 'package-managers') {
			continue;
		}

		for (const framework of Object.keys(parseFrameworkLines(tabsBlockMatch[2] ?? ''))) {
			addFramework(framework);
		}
	}

	return frameworks;
}

/**
 * Filters framework-specific content and package-manager tabs from raw markdown.
 * If no framework is specified, returns markdown unchanged.
 */
export function filterFrameworkContent(markdown: string, options: FilterOptions): string {
	const { framework, packageManager, keepMarkers = false } = options;

	if (!framework) {
		return markdown;
	}

	const normalizedFramework = framework.toLowerCase();

	// First pass: filter framework blocks
	let result = filterFrameworkBlocks(markdown, normalizedFramework, keepMarkers);

	// Second pass: filter package-manager tabs
	result = filterPackageManagerTabs(result, normalizedFramework, packageManager, keepMarkers);

	return result;
}

/**
 * Filters <!-- ::start:framework --> blocks.
 */
function filterFrameworkBlocks(markdown: string, framework: string, keepMarkers: boolean): string {
	const blockRegex = /(<!--\s*::start:framework\s*-->)([\s\S]*?)(<!--\s*::end:framework\s*-->)/gi;

	return markdown.replace(
		blockRegex,
		(_match, startComment: string, blockContent: string, endComment: string) => {
			const sections = splitByFrameworkHeadings(blockContent);
			const frameworkSection = sections.find((s) => s.framework === framework);

			if (!frameworkSection) {
				return '';
			}

			const content = frameworkSection.content.trim();
			if (keepMarkers) {
				return `${startComment}\n${content}\n${endComment}`;
			}
			return content;
		},
	);
}

/**
 * Filters <!-- ::start:tabs variant="package-manager" --> blocks.
 * If framework matches and packageManager is provided, outputs the command.
 * Otherwise returns block as-is.
 */
function filterPackageManagerTabs(
	markdown: string,
	framework: string,
	packageManager: PackageManager | undefined,
	keepMarkers: boolean,
): string {
	// Match tabs blocks with attributes
	const blockRegex = /(<!--\s*::start:tabs\s+([^>]*?)-->)([\s\S]*?)(<!--\s*::end:tabs\s*-->)/gi;

	return markdown.replace(
		blockRegex,
		(fullMatch, startComment: string, attrs: string, blockContent: string, endComment: string) => {
			// Parse attributes to check variant
			const variant = parseAttribute(attrs, 'variant');
			if (variant !== 'package-manager' && variant !== 'package-managers') {
				return fullMatch;
			}

			// Parse framework lines
			const frameworkPackages = parseFrameworkLines(blockContent);
			const packages = frameworkPackages[framework];

			// If no match for framework, return as-is
			if (!packages || packages.length === 0) {
				return fullMatch;
			}

			// If no package manager specified, return as-is
			if (!packageManager) {
				return fullMatch;
			}

			// Generate command based on mode
			const mode = (parseAttribute(attrs, 'mode') as InstallMode) || 'install';
			const commands = getInstallCommand(packageManager, packages, mode);
			const commandText = `\`\`\`sh\n${commands.join('\n')}\n\`\`\``;

			// Return with or without comment markers based on keepMarkers option
			if (keepMarkers) {
				return `${startComment}\n${commandText}\n${endComment}`;
			}
			return commandText;
		},
	);
}

/**
 * Parse a single attribute from an attribute string.
 * e.g., parseAttribute('variant="package-manager" mode="install"', 'variant') => 'package-manager'
 */
function parseAttribute(attrs: string, name: string): string | undefined {
	const regex = new RegExp(`${name}=["']([^"']+)["']`, 'i');
	const match = attrs.match(regex);
	return match?.[1];
}

/**
 * Parse framework lines like "react: @tanstack/react-query" from block content.
 * Returns { framework: [[packages]] } structure.
 */
function parseFrameworkLines(content: string): Record<string, string[][]> {
	const result: Record<string, string[][]> = {};
	const lines = content.split('\n');

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		const colonIndex = trimmed.indexOf(':');
		if (colonIndex === -1) continue;

		const framework = trimmed.slice(0, colonIndex).trim().toLowerCase();
		const packagesStr = trimmed.slice(colonIndex + 1).trim();
		const packages = packagesStr.split(/\s+/).filter(Boolean);

		if (!framework || packages.length === 0) continue;

		if (result[framework]) {
			result[framework].push(packages);
		} else {
			result[framework] = [packages];
		}
	}

	return result;
}

type FrameworkSection = {
	framework: string;
	content: string;
};

/**
 * Splits block content by H1 framework headers.
 */
function splitByFrameworkHeadings(blockContent: string): FrameworkSection[] {
	const sections: FrameworkSection[] = [];
	const headerRegex = /^#\s+(\w+)\s*$/gm;
	let lastIndex = 0;
	let lastFramework: string | null = null;
	let match: RegExpExecArray | null;

	while ((match = headerRegex.exec(blockContent)) !== null) {
		if (lastFramework !== null) {
			sections.push({
				framework: lastFramework,
				content: blockContent.slice(lastIndex, match.index),
			});
		}

		lastFramework = match[1].toLowerCase();
		lastIndex = match.index + match[0].length;
	}

	if (lastFramework !== null) {
		sections.push({
			framework: lastFramework,
			content: blockContent.slice(lastIndex),
		});
	}

	return sections;
}
