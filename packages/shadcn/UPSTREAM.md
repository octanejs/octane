# Upstream provenance

The component source baseline is `shadcn-ui/ui` commit
`4baadbc6517070ae8f8feb2c97037adc2b305544`. The distribution/CLI baseline
recorded by this port is `shadcn@4.14.1`. These are distinct inputs: the npm
package is the registry CLI, while component implementations live in the Git
repository.

| Input | Location | Integrity |
| --- | --- | --- |
| Git source archive | `https://github.com/shadcn-ui/ui/archive/4baadbc6517070ae8f8feb2c97037adc2b305544.tar.gz` | SHA-256 `015a8c4972120e794fa648ef6604fdd0ff94d4748c9308b0cfe147c177b5df4a` |
| npm tarball | `https://registry.npmjs.org/shadcn/-/shadcn-4.14.1.tgz` | SHA-256 `a264f1be8f1247c755e1186a0b3eba305fb581f04a4bfccf5077ea43a548256d` |
| npm license | `package/LICENSE.md` | MIT; SHA-256 `1564074e13439397221ffd522e2e504d56561994a23d371aa5e3ad43e4f5423f` |

## Upstream artifact inventory

The pinned component registry contains the following executable component
surfaces. Counts include component modules plus their base-local examples,
blocks, hooks, libraries, and registry metadata.

| Source surface | Archive inventory | Port relationship |
| --- | ---: | --- |
| `apps/v4/registry/bases/radix` | 391 files | Primary default component base; partially transcribed/adapted |
| `apps/v4/registry/bases/aria` | 371 files | React Aria component base; partially transcribed/adapted |
| `apps/v4/registry/bases/base` | 379 files | Base UI component base; partial port |
| `apps/v4/registry/new-york-v4/ui` | 63 component files | Historical/default style input and comparison surface |
| `apps/v4/registry/new-york-v4/examples` | 245 files | Not ported; examples are not runtime package surface |
| `apps/v4/registry/new-york-v4/blocks` | 159 files | Not ported; site/application blocks are out of package scope |
| `apps/v4/registry/new-york-v4/charts` | 72 files | Not ported; chart examples are out of package scope |
| `packages/shadcn/src` | CLI commands, registry, schema, transforms, styles, MCP, presets, templates, and utilities | The Octane package emits a compatible registry but does not port the CLI runtime |
| `packages/shadcn/test/fixtures` | 287 framework fixture files plus project/config fixtures | Not executed; they validate the upstream CLI rather than component renderer parity |

The npm tarball contains 27 published files: the CLI entry and chunks, registry,
schema, preset, icons, MCP, and utility entries and declarations, Tailwind CSS,
README, package metadata, and MIT license. It contains no React component runtime
to execute against the Octane port.

## Upstream test inventory

The source archive contains registry tests (`apps/v4/registry/calendar.test.ts`
and `config.test.ts`) and the CLI package suites under `packages/shadcn/src`:
command tests, registry resolver/parser/schema/fetcher tests, MCP, migrations,
preflights, presets, styles, templates, utilities, transformers, updaters, and
their snapshots/fixtures. Those suites exercise registry and CLI behavior; they
are inventoried but not treated as React component parity.

The bounded `shadcn-runtime-differential` lane selects five exact cases from one
shared fixture and cites these pinned upstream sources at
`4baadbc6517070ae8f8feb2c97037adc2b305544`:

| Local React reference | Cited upstream source | Allowed transform |
| --- | --- | --- |
| `tests/differential/upstream/badge.tsx` | `apps/v4/registry/bases/radix/ui/badge.tsx` | Port-selected class hooks for the package's default-Tailwind flavor |
| `tests/differential/upstream/button.tsx` | `apps/v4/registry/bases/radix/ui/button.tsx` | Port-selected class hooks; plain `<button>` host matching the Octane port |
| `tests/differential/upstream/tabs.tsx` | `apps/v4/registry/bases/radix/ui/tabs.tsx` | Port-selected class hooks; local `utils` import rewrite |
| `tests/differential/upstream/dialog.tsx` | `apps/v4/registry/bases/radix/ui/dialog.tsx` | Import-path rewrite only |
| `tests/differential/upstream/dropdown-menu.tsx` | `apps/v4/registry/bases/radix/ui/dropdown-menu.tsx` | Import-path rewrite only |
| `tests/differential/upstream/icon-placeholder.tsx` | CLI `iconLibrary: "lucide"` resolution | Local lucide-react shim used by vendored references |

Those local React references are lineage evidence with the transforms above; they
are not themselves the pinned upstream oracle. The lane proves same-fixture
React/Octane runtime equivalence under that cited lineage. Structured
native-input, descriptor-`asChild`, icon-resolution, and Sonner-theme
divergences remain authenticated by ordinary-shard Octane-only tests and are
not counted as React-parity evidence. All other local tests are classified as
Octane framework contracts.

## Monitoring

When updating either pin, fetch both artifacts again, record new SHA-256 values,
reconcile the complete registry/CLI inventories, refresh every vendored reference
and its manifest hash, then rerun the exact differential and behavioral lanes.
