---
'@octanejs/adapter-cloudflare': patch
'@octanejs/adapter-vercel': patch
'@octanejs/apollo-client': patch
'@octanejs/app-core': patch
'@octanejs/aria': patch
'@octanejs/astro': patch
'@octanejs/base-ui': patch
'@octanejs/cli': patch
'@octanejs/cmdk': patch
'create-octane': patch
'@octanejs/devtools': patch
'@octanejs/dexie': patch
'@octanejs/dnd-kit': patch
'@octanejs/docusaurus': patch
'@octanejs/electron': patch
'@octanejs/floating-ui': patch
'@octanejs/hook-form': patch
'@octanejs/i18next': patch
'@octanejs/jotai': patch
'@octanejs/lexical': patch
'@octanejs/lucide': patch
'@octanejs/mantine-hooks': patch
'@octanejs/mdx': patch
'@octanejs/mobx': patch
'@octanejs/motion': patch
'@octanejs/nuqs': patch
'octane': patch
'@octanejs/mcp-server': patch
'@octanejs/phosphor-icons': patch
'@octanejs/radix': patch
'@octanejs/rainbowkit': patch
'@octanejs/react-error-boundary': patch
'@octanejs/recharts': patch
'@octanejs/redux': patch
'@octanejs/redux-toolkit': patch
'@octanejs/remix-router': patch
'@octanejs/rsbuild-plugin': patch
'@octanejs/rspack-plugin': patch
'@octanejs/rxjs': patch
'@octanejs/seo': patch
'@octanejs/shadcn': patch
'@octanejs/sonner': patch
'@octanejs/streamdown': patch
'@octanejs/styled-components': patch
'@octanejs/stylex': patch
'@octanejs/tanstack-ai': patch
'@octanejs/tanstack-devtools': patch
'@octanejs/tanstack-form': patch
'@octanejs/tanstack-hotkeys': patch
'@octanejs/tanstack-pacer': patch
'@octanejs/tanstack-query': patch
'@octanejs/tanstack-router': patch
'@octanejs/tanstack-router-ssr-query': patch
'@octanejs/tanstack-start': patch
'@octanejs/tanstack-store': patch
'@octanejs/tanstack-table': patch
'@octanejs/tanstack-virtual': patch
'@octanejs/tauri': patch
'@octanejs/testing-library': patch
'@octanejs/three': patch
'@octanejs/tiptap': patch
'@octanejs/usehooks-ts': patch
'@octanejs/valtio': patch
'@octanejs/visx': patch
'@octanejs/vite-plugin': patch
'@octanejs/wagmi': patch
'@octanejs/zustand': patch
---

Require Node.js 22.22.2 or newer across Octane's published packages.

Add the `octane/compiler/register` preload for running server and SSG scripts
directly with Node or Bun. It compiles imported `.tsrx`/`.tsx` modules and
plain TypeScript custom hooks in server mode without a Vite build. Bun also
targets bare `octane` imports at `octane/server` in pass-through authored source
dependencies, including packages that manage their hook slots manually.
