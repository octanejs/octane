/**
 * Shared types and utility for generating package manager install commands.
 * Used by both server-side markdown filtering and client-side PackageManagerTabs.
 */

export const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'] as const;

export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

export function isPackageManager(value: string): value is PackageManager {
	return (PACKAGE_MANAGERS as ReadonlyArray<string>).includes(value);
}

export type InstallMode = 'install' | 'dev-install' | 'local-install' | 'create' | 'custom';

/**
 * Get package manager from query parameter, defaulting to 'npm' if not specified or invalid.
 */
export function getPackageManager(pm: string | null | undefined): PackageManager {
	if (pm && (PACKAGE_MANAGERS as ReadonlyArray<string>).includes(pm)) {
		return pm as PackageManager;
	}
	return 'npm'; // default
}

/**
 * Generate install command(s) for a package manager.
 * Each group of packages becomes one command line.
 */
export function getInstallCommand(
	packageManager: PackageManager,
	packageGroups: string[][],
	mode: InstallMode,
): string[] {
	const commands: string[] = [];

	if (mode === 'custom') {
		for (const packages of packageGroups) {
			const pkgStr = packages.join(' ');
			switch (packageManager) {
				case 'npm':
					commands.push(`npm ${pkgStr}`);
					break;
				case 'pnpm':
					commands.push(`pnpm ${pkgStr}`);
					break;
				case 'yarn':
					commands.push(`yarn ${pkgStr}`);
					break;
				case 'bun':
					commands.push(`bun ${pkgStr}`);
					break;
			}
		}
		return commands;
	}

	if (mode === 'create') {
		for (const packages of packageGroups) {
			const pkgStr = packages.join(' ');
			switch (packageManager) {
				case 'npm':
					commands.push(`npm create ${pkgStr}`);
					break;
				case 'pnpm':
					commands.push(`pnpm create ${pkgStr}`);
					break;
				case 'yarn':
					commands.push(`yarn create ${pkgStr}`);
					break;
				case 'bun':
					commands.push(`bun create ${pkgStr}`);
					break;
			}
		}
		return commands;
	}

	if (mode === 'local-install') {
		for (const packages of packageGroups) {
			const pkgStr = packages.join(' ');
			switch (packageManager) {
				case 'npm':
					commands.push(`npx ${pkgStr}`);
					break;
				case 'pnpm':
					commands.push(`pnpx ${pkgStr}`);
					break;
				case 'yarn':
					commands.push(`yarn dlx ${pkgStr}`);
					break;
				case 'bun':
					commands.push(`bunx ${pkgStr}`);
					break;
			}
		}
		return commands;
	}

	if (mode === 'dev-install') {
		for (const packages of packageGroups) {
			const pkgStr = packages.join(' ');
			switch (packageManager) {
				case 'npm':
					commands.push(`npm i -D ${pkgStr}`);
					break;
				case 'pnpm':
					commands.push(`pnpm add -D ${pkgStr}`);
					break;
				case 'yarn':
					commands.push(`yarn add -D ${pkgStr}`);
					break;
				case 'bun':
					commands.push(`bun add -d ${pkgStr}`);
					break;
			}
		}
		return commands;
	}

	// install mode (default)
	for (const packages of packageGroups) {
		const pkgStr = packages.join(' ');
		switch (packageManager) {
			case 'npm':
				commands.push(`npm i ${pkgStr}`);
				break;
			case 'pnpm':
				commands.push(`pnpm add ${pkgStr}`);
				break;
			case 'yarn':
				commands.push(`yarn add ${pkgStr}`);
				break;
			case 'bun':
				commands.push(`bun add ${pkgStr}`);
				break;
		}
	}
	return commands;
}
