/* eslint-disable security/detect-non-literal-fs-filename */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { RolldownPluginOption } from 'rolldown';
import { defineConfig, type UserConfig, type UserConfigFn } from 'tsdown';

type Framework = 'angular' | 'preact' | 'qwik' | 'react' | 'solid' | 'svelte' | 'vue';

/**
 * Rolldown plugin to rewrite framework-specific imports.
 */
function rewriteFrameworkImports(framework: Framework): RolldownPluginOption {
  return {
    name: 'rewrite-framework-imports',

    // Transform imports of `.d.ts` files to framework-specific files
    transform(code, id) {
      if (id.endsWith('.d.ts') && !id.endsWith(`.${framework}.d.ts`)) {
        // Match all relative import statements
        const imports = code.matchAll(/from "(\.[\w-/.]*\/([\w-]+).ts)";$/gm);

        // Create variable for modified source code
        let modifiedCode: string | undefined;

        for (const [fullMatch, filePath, fileName] of imports) {
          // Create path to framework-specific file
          const frameworkFilePath = `/${join(
            ...id.split('/').slice(0, -1),
            ...filePath.split('/').slice(0, -1),
            `${fileName}.${framework}.ts`
          )}`;

          // If framework-specific file exists, rewrite import
          if (existsSync(frameworkFilePath)) {
            modifiedCode = (modifiedCode || code).replace(
              fullMatch,
              fullMatch.replace('.ts', `.${framework}.ts`)
            );
          }
        }

        // Return modified source code
        return modifiedCode;
      }
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
  framework: Framework | null
): UserConfig | UserConfigFn {
  return defineConfig({
    entry: ['./src/index.ts'],
    external: [
      '@angular/core',
      '@preact/signals',
      '@qwik.dev/core',
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
    outExtensions() {
      if (framework) {
        return {
          js: `.${framework}.js`,
          dts: `.${framework}.d.ts`,
        };
      }
      return {
        js: '.js',
        dts: '.d.ts',
      };
    },
    plugins: framework ? [rewriteFrameworkImports(framework)] : [],
  });
}

const config: (UserConfig | UserConfigFn)[] = [
  defineFrameworkConfig(null),
  defineFrameworkConfig('angular'),
  defineFrameworkConfig('preact'),
  defineFrameworkConfig('qwik'),
  defineFrameworkConfig('react'),
  defineFrameworkConfig('solid'),
  defineFrameworkConfig('svelte'),
  defineFrameworkConfig('vue'),
];

export default config;
