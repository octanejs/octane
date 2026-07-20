import { sentryTanstackStart } from '@sentry/tanstackstart-react/vite'
import { defineConfig } from 'vite'
import type { PluginOption } from 'vite'
import { redact } from '@tanstack/redact/vite'
import contentCollections from '@content-collections/vite'
import { devtools as tanstackDevtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { analyzer } from 'vite-bundle-analyzer'
import viteReact from '@vitejs/plugin-react'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

const nodeRequire = createRequire(import.meta.url)
const isDev = process.env.NODE_ENV !== 'production'
const takumiWasmRuntimePath = path.join(
  path.dirname(path.dirname(nodeRequire.resolve('@takumi-rs/wasm/no-bundler'))),
  'bundlers/workerd.js',
)
const shouldUseRedact = process.env.DISABLE_REDACT !== 'true'
const localRedactPackageRoot = process.env.LOCAL_REDACT_PACKAGE_ROOT
const shouldUseSentryPlugin =
  process.env.NODE_ENV === 'production' &&
  Boolean(process.env.SENTRY_AUTH_TOKEN)
const shouldBuildSourcemaps =
  shouldUseSentryPlugin || process.env.BUILD_SOURCEMAPS === 'true'
const SITE_URL = 'https://tanstack.com'

const localEnvPath = path.resolve(__dirname, '.env.local')
const defaultCheckoutEnvDir = path.join(os.homedir(), 'GitHub/tanstack.com')
const envDir =
  !fs.existsSync(localEnvPath) &&
  fs.existsSync(path.join(defaultCheckoutEnvDir, '.env.local'))
    ? defaultCheckoutEnvDir
    : __dirname

function edgeTakumiWasmImport(): PluginOption {
  return {
    name: 'tanstack-edge-takumi-wasm-import',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('/node_modules/takumi-js/dist/render-')) return

      return code.replace(
        /import\(\s*\/\*\s*@vite-ignore\s*\*\/\s*['"]@takumi-rs\/wasm['"]\s*\)/g,
        'import("@takumi-rs/wasm/no-bundler")',
      )
    },
  }
}

// Runtime-specific `react-dom/server` variants aren't in @tanstack/redact/vite's
// default alias map. Funnel them all to `@tanstack/redact/server` at the
// top-level resolve so Workers get a single server implementation.
const serverVariantAliases: Record<string, string> = {
  'react-dom/server': '@tanstack/redact/server',
  'react-dom/server.edge': '@tanstack/redact/server',
  'react-dom/server.node': '@tanstack/redact/server',
  'react-dom/server.bun': '@tanstack/redact/server',
  'react-dom/server.browser': '@tanstack/redact/server',
  'react-dom/static.edge': '@tanstack/redact/server',
  'react-dom/static.node': '@tanstack/redact/server',
  'react-dom/static': '@tanstack/redact/server',
}

const useSyncExternalStoreShimIndexAlias = {
  find: /^use-sync-external-store\/shim\/index\.js$/,
  replacement: '@tanstack/redact',
}

// These browser-facing packages are imported by SSR assets. Bundle them into
// Worker server output so the runtime never loads their raw package entries.
const serverBundledClientPackages = [
  ...(shouldUseRedact ? ['@tanstack/redact'] : []),
  /^@radix-ui\//,
  '@kapaai/react-sdk',
  '@tanstack/highlight',
  '@tanstack/markdown',
  '@tanstack/react-hotkeys',
  '@tanstack/react-pacer',
  '@tanstack/react-table',
  'lucide-react',
  'zustand',
  /^@fingerprintjs\//,
]

const routerSsrPackages = [
  '@tanstack/history',
  '@tanstack/query-core',
  '@tanstack/react-query',
  '@tanstack/react-router',
  '@tanstack/react-router-ssr-query',
  '@tanstack/react-router/ssr',
  '@tanstack/react-router/ssr/server',
  '@tanstack/router-core',
]

export default defineConfig({
  envDir,
  define: {
    __TANSTACK_ENABLE_SERVER_BUILDER_GENERATION__: JSON.stringify(true),
    __TANSTACK_ENABLE_IMAGE_TRANSFORMATIONS__: JSON.stringify(true),
    __TANSTACK_SITE_URL__: JSON.stringify(SITE_URL),
  },
  resolve: {
    alias: [
      {
        find: '~',
        replacement: path.resolve(__dirname, './src'),
      },
      {
        find: 'ejs',
        replacement: path.resolve(
          __dirname,
          './src/server/runtime/ejs-compat.server.ts',
        ),
      },
      {
        find: 'unicorn-magic',
        replacement: 'unicorn-magic/node',
      },
      {
        find: '@takumi-rs/wasm/auto',
        replacement: takumiWasmRuntimePath,
      },
      ...(shouldUseRedact
        ? [
            useSyncExternalStoreShimIndexAlias,
            ...Object.entries(serverVariantAliases).map(
              ([find, replacement]) => ({
                find,
                replacement,
              }),
            ),
          ]
        : []),
    ],
  },
  server: {
    port: Number(process.env.PORT) || 3000,
    // WebContainer headers for /builder route (SharedArrayBuffer support)
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    // Watch linked @tanstack/cli for hot reload during development
    watch: isDev
      ? {
          ignored: ['!**/node_modules/@tanstack/cli/**'],
        }
      : undefined,
  },
  environments: {
    ssr: {
      optimizeDeps: {
        exclude: ['@tanstack/create'],
      },
      resolve: {
        noExternal: [...serverBundledClientPackages, ...routerSsrPackages],
      },
    },
  },
  ssr: {
    external: [],
    noExternal: [
      '@uploadthing/react',
      'file-selector',
      'normalize-wheel',
      '@tanstack/react-hotkeys',
      '@webcontainer/api',
      ...serverBundledClientPackages,
      ...routerSsrPackages,
    ],
  },
  optimizeDeps: {
    exclude: [
      'postgres',
      // CTA packages use execa which has a broken unicorn-magic dependency
      '@tanstack/create',
      'discord-interactions',
      // OG image generation: takumi ships a native .node binary
      '@takumi-rs/core',
      '@takumi-rs/image-response',
      '@takumi-rs/helpers',
      'takumi-js',
      // Don't pre-bundle CLI so we always get fresh changes during dev
      ...(isDev ? ['@tanstack/cli'] : []),
      // Lucide can resolve differently across Vite environments when combined
      // with our React shim. Excluding it keeps resolution deterministic.
      'lucide-react',
    ],
  },
  build: {
    minify: 'esbuild',
    sourcemap: shouldBuildSourcemaps,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (
            id.includes('/node_modules/@tanstack/react-start') ||
            id.includes('/node_modules/@tanstack/start-')
          ) {
            return 'tanstack-start'
          }

          if (
            id.includes('/src/db/types.ts') ||
            id.includes('/src/libraries/ids.ts')
          ) {
            return 'shared-constants'
          }

          if (
            id.includes('/node_modules/@tanstack/react-router') ||
            id.includes('/node_modules/@tanstack/router-core') ||
            id.includes('/node_modules/@tanstack/history')
          ) {
            return 'tanstack-router'
          }

          if (
            id.includes('/node_modules/@tanstack/react-query') ||
            id.includes('/node_modules/@tanstack/query-core')
          ) {
            return 'tanstack-query'
          }

          // Vendor chunk splitting for better caching
          if (id.includes('node_modules')) {
            // Lucide icons (tree-shaken but still significant)
            if (id.includes('lucide-react')) {
              return 'icons'
            }

            if (
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react/') ||
              id.includes('node_modules/scheduler/')
            ) {
              return 'react'
            }
          }
        },
      },
    },
  },
  plugins: [
    edgeTakumiWasmImport(),
    cloudflare({
      viteEnvironment: { name: 'ssr' },
    }),
    ...(shouldUseRedact
      ? [
          redact(
            localRedactPackageRoot
              ? {
                  packageRoots: {
                    '@tanstack/redact': localRedactPackageRoot,
                  },
                }
              : undefined,
          ),
        ]
      : []),
    ...(isDev
      ? [
          tanstackDevtools({
            // Console piping mirrors server logs into the browser and browser
            // logs back into Vite. A streamed server error can recursively echo
            // through that bridge and flood the dev server log.
            consolePiping: {
              enabled: false,
            },
            // react-instantsearch's <Configure> forwards all JSX props as
            // Algolia search parameters. Injecting `data-tsd-source` as a
            // JSX attr leaks it into the request and Algolia 400s with
            // "Unknown parameter: data-tsd-source" — breaks site search in dev.
            injectSource: {
              enabled: true,
              ignore: { components: ['Configure'] },
            },
          }),
        ]
      : []),
    tanstackStart({
      server: {
        build: {
          inlineCss: false,
        },
      },
      importProtection: {
        behavior: 'error',
        client: {
          files: ['**/*.server.*', '**/server/**'],
          specifiers: [
            '@tanstack/react-start/server',
            'uploadthing/server',
            /^@modelcontextprotocol\/sdk\/server\//,
            'discord-interactions',
          ],
        },
      },
      router: {
        codeSplittingOptions: {
          defaultBehavior: [
            [
              'component',
              'pendingComponent',
              'errorComponent',
              'notFoundComponent',
              'loader',
            ],
          ],
        },
      },
    }),
    viteReact(),

    ...(shouldUseSentryPlugin
      ? [
          sentryTanstackStart({
            authToken: process.env.SENTRY_AUTH_TOKEN,
            org: 'tanstack',
            project: 'tanstack-com',
          }),
        ]
      : []),
    contentCollections(),
    tailwindcss(),
    ...(process.env.ANALYZE
      ? [
          analyzer({
            analyzerMode: 'json',
            fileName: 'bundle-analysis',
            defaultSizes: 'stat',
          }),
        ]
      : []),
  ],
})
