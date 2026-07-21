/**
 * Provider Configuration Utilities
 *
 * Functions for injecting provider-specific configuration into example projects.
 * This enables 1-click deploys to Cloudflare, Netlify, Railway, etc.
 */

export type DeployProvider = 'cloudflare' | 'netlify' | 'railway';

interface ProviderConfigResult {
	files: Record<string, string>;
	devDependencies: Record<string, string>;
}

/**
 * Check if an example is a TanStack Start app by looking at package.json
 */
export function isStartApp(files: Record<string, string>): boolean {
	const packageJson = files['package.json'];
	if (!packageJson) return false;

	try {
		const pkg = JSON.parse(packageJson);
		const allDeps = {
			...pkg.dependencies,
			...pkg.devDependencies,
		};
		return '@tanstack/react-start' in allDeps || '@tanstack/solid-start' in allDeps;
	} catch {
		return false;
	}
}

/**
 * Get provider-specific configuration files and dependencies
 */
export function getProviderConfig(
	provider: DeployProvider,
	projectName: string,
): ProviderConfigResult {
	switch (provider) {
		case 'cloudflare':
			return getCloudflareConfig(projectName);
		case 'netlify':
			return getNetlifyConfig();
		case 'railway':
			return getRailwayConfig();
		default:
			return { files: {}, devDependencies: {} };
	}
}

/**
 * Cloudflare Workers configuration
 */
function getCloudflareConfig(projectName: string): ProviderConfigResult {
	const wranglerConfig = {
		$schema: 'node_modules/wrangler/config-schema.json',
		name: sanitizeProjectName(projectName),
		compatibility_date: '2025-01-01',
		compatibility_flags: ['nodejs_compat'],
		main: '@tanstack/react-start/server-entry',
	};

	return {
		files: {
			'wrangler.jsonc': JSON.stringify(wranglerConfig, null, 2),
		},
		devDependencies: {
			'@cloudflare/vite-plugin': '^1.0.0',
			wrangler: '^4.0.0',
		},
	};
}

/**
 * Netlify configuration
 */
function getNetlifyConfig(): ProviderConfigResult {
	const netlifyToml = `[build]
  command = "npm run build"
  publish = "dist/client"

[dev]
  command = "npm run dev"
  port = 3000
`;

	return {
		files: {
			'netlify.toml': netlifyToml,
		},
		devDependencies: {
			'@netlify/vite-plugin-tanstack-start': '^1.0.0',
		},
	};
}

/**
 * Railway configuration (uses Nitro)
 */
function getRailwayConfig(): ProviderConfigResult {
	// Railway uses Nitro for the Node server build, no additional config files needed
	// Just need the nitro dependency
	return {
		files: {},
		devDependencies: {
			nitro: 'latest',
		},
	};
}

/**
 * Sanitize project name for use in configs (lowercase, hyphens only)
 */
function sanitizeProjectName(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

/**
 * Apply provider configuration to a set of files
 *
 * This merges provider-specific config files and updates package.json
 * with necessary dependencies and scripts.
 *
 * For Start apps: applies full server-side provider config
 * For non-Start apps (SPAs): applies static site config
 */
export function applyProviderConfig(
	files: Record<string, string>,
	provider: DeployProvider,
	projectName: string,
): Record<string, string> {
	const isStart = isStartApp(files);
	const result = { ...files };

	if (isStart) {
		// Full server-side config for Start apps
		console.log('[applyProviderConfig] Start app, applying full provider config');
		const config = getProviderConfig(provider, projectName);

		// Add provider-specific config files
		for (const [path, content] of Object.entries(config.files)) {
			result[path] = content;
		}

		// Update package.json with dependencies and scripts
		if (result['package.json']) {
			result['package.json'] = updatePackageJson(
				result['package.json'],
				provider,
				config.devDependencies,
			);
		}

		// Update vite.config.ts with provider plugin
		const viteConfigPath = findViteConfig(result);
		if (viteConfigPath) {
			result[viteConfigPath] = updateViteConfig(result[viteConfigPath], provider);
		}
	} else {
		// Static site config for SPAs
		console.log('[applyProviderConfig] SPA, applying static site config');
		const config = getStaticSiteConfig(provider);

		// Add static site config files
		for (const [path, content] of Object.entries(config.files)) {
			result[path] = content;
		}
	}

	return result;
}

/**
 * Get static site configuration for non-Start apps (SPAs)
 */
function getStaticSiteConfig(provider: DeployProvider): {
	files: Record<string, string>;
} {
	switch (provider) {
		case 'cloudflare': {
			// Cloudflare Pages config for static sites
			// Uses _headers and _redirects files for SPA routing
			const redirects = `/*    /index.html   200`;
			return {
				files: {
					'public/_redirects': redirects,
				},
			};
		}

		case 'netlify': {
			// Netlify static site config
			const netlifyToml = `[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
`;
			return {
				files: {
					'netlify.toml': netlifyToml,
				},
			};
		}

		case 'railway': {
			// Railway can serve static files, needs a simple config
			// Uses nixpacks which auto-detects Vite projects
			const nixpacksToml = `[phases.build]
cmds = ["npm install", "npm run build"]

[phases.setup]
nixPkgs = ["nodejs_22"]

[start]
cmd = "npx serve dist -s -l 3000"
`;
			return {
				files: {
					'nixpacks.toml': nixpacksToml,
				},
			};
		}

		default:
			return { files: {} };
	}
}

/**
 * Find the vite config file in the project
 */
function findViteConfig(files: Record<string, string>): string | null {
	const candidates = ['vite.config.ts', 'vite.config.js', 'vite.config.mts'];
	return candidates.find((path) => path in files) ?? null;
}

/**
 * Update package.json with provider-specific dependencies and scripts
 */
function updatePackageJson(
	content: string,
	provider: DeployProvider,
	devDependencies: Record<string, string>,
): string {
	try {
		const pkg = JSON.parse(content);

		// Add dev dependencies
		pkg.devDependencies = {
			...pkg.devDependencies,
			...devDependencies,
		};

		// Update scripts based on provider
		pkg.scripts = pkg.scripts ?? {};

		switch (provider) {
			case 'cloudflare':
				pkg.scripts.preview = 'vite preview';
				pkg.scripts.deploy = 'npm run build && wrangler deploy';
				// Remove node-based start script if present
				if (pkg.scripts.start?.includes('node')) {
					delete pkg.scripts.start;
				}
				break;

			case 'netlify':
				// Netlify handles deployment via their platform
				// Just ensure build script exists
				pkg.scripts.build = pkg.scripts.build ?? 'vite build';
				break;

			case 'railway':
				// Railway needs node-based start script for Nitro
				pkg.scripts.build = 'vite build';
				pkg.scripts.start = 'node .output/server/index.mjs';
				break;
		}

		return JSON.stringify(pkg, null, 2);
	} catch {
		return content;
	}
}

/**
 * Update vite.config.ts with provider-specific plugin
 */
function updateViteConfig(content: string, provider: DeployProvider): string {
	// This is a best-effort transformation
	// It adds the necessary import and plugin to the vite config

	let result = content;

	switch (provider) {
		case 'cloudflare': {
			// Add cloudflare import if not present
			if (!result.includes('@cloudflare/vite-plugin')) {
				// Find a good place to add the import (after other imports)
				const lastImportIndex = findLastImportIndex(result);
				const importStatement = `import { cloudflare } from '@cloudflare/vite-plugin'\n`;
				result = result.slice(0, lastImportIndex) + importStatement + result.slice(lastImportIndex);
			}

			// Add cloudflare() to plugins array
			result = addPluginToConfig(result, `cloudflare({ viteEnvironment: { name: 'ssr' } })`);
			break;
		}

		case 'netlify': {
			// Add netlify import if not present
			if (!result.includes('@netlify/vite-plugin-tanstack-start')) {
				const lastImportIndex = findLastImportIndex(result);
				const importStatement = `import netlify from '@netlify/vite-plugin-tanstack-start'\n`;
				result = result.slice(0, lastImportIndex) + importStatement + result.slice(lastImportIndex);
			}

			// Add netlify() to plugins array
			result = addPluginToConfig(result, 'netlify()');
			break;
		}

		case 'railway': {
			// Add nitro import if not present
			if (!result.includes('nitro/vite')) {
				const lastImportIndex = findLastImportIndex(result);
				const importStatement = `import { nitro } from 'nitro/vite'\n`;
				result = result.slice(0, lastImportIndex) + importStatement + result.slice(lastImportIndex);
			}

			// Add nitro() to plugins array
			result = addPluginToConfig(result, 'nitro()');
			break;
		}
	}

	return result;
}

/**
 * Find the index after the last import statement
 */
function findLastImportIndex(content: string): number {
	const importRegex = /^import\s.+$/gm;
	let lastIndex = 0;
	let match;

	while ((match = importRegex.exec(content)) !== null) {
		lastIndex = match.index + match[0].length + 1;
	}

	return lastIndex || 0;
}

/**
 * Add a plugin to the plugins array in vite config
 */
function addPluginToConfig(content: string, pluginCall: string): string {
	// Look for plugins: [ pattern
	const pluginsRegex = /plugins\s*:\s*\[/;

	const match = pluginsRegex.exec(content);
	if (!match) {
		return content;
	}

	// Insert the plugin after the opening bracket
	const insertIndex = match.index + match[0].length;
	return content.slice(0, insertIndex) + `\n    ${pluginCall},` + content.slice(insertIndex);
}

/**
 * Generate a description for the deployed repo
 */
export function generateExampleDescription(
	libraryName: string,
	exampleName: string,
	provider: DeployProvider,
): string {
	const providerNames: Record<DeployProvider, string> = {
		cloudflare: 'Cloudflare',
		netlify: 'Netlify',
		railway: 'Railway',
	};

	return `${libraryName} example: ${exampleName} (configured for ${providerNames[provider]})`;
}
