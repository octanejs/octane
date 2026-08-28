/* eslint-disable security/detect-non-literal-fs-filename */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { RolldownPluginOption } from 'rolldown';
import { defineConfig, type UserConfig, type UserConfigFn } from 'tsdown';

type Framework = 'preact' | 'qwik' | 'react' | 'solid' | 'svelte' | 'vue';

/**
 * Rolldown plugin to rewrite framework-specific imports.
 */
function rewriteFrameworkImports(framework: Framework): RolldownPluginOption {
  return {
    name: 'rewrite-framework-imports',

    // Transform core imports to framework-specific imports
    // Also transform .d.ts imports to framework-specific files
    transform(code, id) {
      let modifiedCode = code.replace(
        /(["'])@formisch\/core\1/g,
        `$1@formisch/core/${framework}$1`
      );

      // Transform imports of `.d.ts` files to framework-specific files
      if (id.endsWith('.d.ts') && !id.endsWith(`.${framework}.d.ts`)) {
        // Match all relative import statements
        const imports = modifiedCode.matchAll(
          /from "(\.[\w-/.]*\/([\w-]+).ts)";$/gm
        );

        for (const [fullMatch, filePath] of imports) {
          // Create path to framework-specific file
          const frameworkFilePath = `/${join(
            ...id.split('/').slice(0, -1),
            filePath.replace('.ts', `.${framework}.ts`)
          )}`;

          // If framework-specific file exists, rewrite import
          if (existsSync(frameworkFilePath)) {
            modifiedCode = modifiedCode.replace(
              fullMatch,
              fullMatch.replace('.ts', `.${framework}.ts`)
            );
          }
        }
      }

      return modifiedCode;
    },

    // Resolve imports of `.ts` files to framework-specific files
    async resolveId(source, importer) {
      // Skip rewriting if importer is already a framework-specific file
      if (importer?.endsWith(`.${framework}.ts`)) {
        return null;
      }

      // Resolve full path of imported file
      const resolved = await this.resolve(source, importer, {
        skipSelf: true,
      });

      // Continue if not null and not external
      if (resolved && !resolved.external) {
        // Create path to framework-specific file
        const frameworkFilePath = resolved.id.replace(
          /\/([\w-]+)\.ts$/,
          `/$1.${framework}.ts`
        );

        // If framework-specific file exists, rewrite import
        if (existsSync(frameworkFilePath)) {
          return { id: frameworkFilePath, external: false };
        }
      }

      // Otherwise, return original resolution
      return resolved;
    },
  };
}

/**
 * Defines the configuration for a specific framework.
 */
function defineFrameworkConfig(
  framework: Framework
): UserConfig | UserConfigFn {
  return defineConfig({
    entry: ['./src/index.ts'],
    external: [
      '@formisch/core',
      `@formisch/core/${framework}`,
      '@preact/signals',
      '@qwik.dev/core',
      'react',
      'solid-js',
      'svelte',
      'valibot',
      'vue',
    ],
    clean: true,
    format: ['es'],
    minify: false,
    dts: true,
    outDir: './dist',
    outExtensions: () => ({
      js: `.${framework}.js`,
      dts: `.${framework}.d.ts`,
    }),
    plugins: [rewriteFrameworkImports(framework)],
  });
}

const config: (UserConfig | UserConfigFn)[] = [
  defineFrameworkConfig('preact'),
  defineFrameworkConfig('qwik'),
  defineFrameworkConfig('react'),
  defineFrameworkConfig('solid'),
  defineFrameworkConfig('svelte'),
  defineFrameworkConfig('vue'),
];

export default config;
