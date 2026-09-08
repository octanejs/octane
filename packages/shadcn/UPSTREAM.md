# Upstream provenance

The current registry baseline is `shadcn@4.21.0`, tied by npm's signed build
provenance to `shadcn-ui/ui@7c9eaba1c0a6404c990c144a654792e3313c650d`.
The npm package is a CLI; component sources live in `apps/v4/registry/bases`.
The Octane binding consumes that registry and does not port the CLI itself.

| Input | Location | Integrity |
| --- | --- | --- |
| Release sources | [Git commit](https://github.com/shadcn-ui/ui/tree/7c9eaba1c0a6404c990c144a654792e3313c650d) | Commit `7c9eaba1c0a6404c990c144a654792e3313c650d` |
| npm tarball | [shadcn 4.21.0](https://registry.npmjs.org/shadcn/-/shadcn-4.21.0.tgz) | SHA-256 `21e50e002f243fefc94f4a47cd66c0babf5041f2c69b8be34a18e89c9cf16523` |
| MIT license | `LICENSE.upstream` | SHA-256 `1564074e13439397221ffd522e2e504d56561994a23d371aa5e3ad43e4f5423f` |

## Scope of the update

Comparing the prior component pin `4baadbc6517070ae8f8feb2c97037adc2b305544`
with the release commit shows the existing families changed their class helper
imports to `cn`. The binding adopts `cn@0.2.6` across all three bases and retains
its tested adaptations and local styling choices. Its `/cn` entry re-exports
that helper, preserving the existing import surface.

Base UI Select, Navigation Menu, and Scroll Area are new wrappers over the merged
Base UI 1.8.0 binding. Their original sources are preserved in `upstream/base/`,
alongside the release's `upstream/style-nova.css`. `audit/shadcn-4.21.0.json`
records their hashes and transformations. The release CLI's style transformer
resolves Nova utility classes; Lucide resolves the default icon placeholders.
The React references in `tests/differential/base-upstream/` retain React and the
real `@base-ui/react@1.8.0` imports. Octane sources substitute the native bindings
and omit the RSC directive.

The coverage table tracks 44 existing families, with 43 Base UI wrappers. It is
not a complete upstream registry inventory. Base UI Sonner and additional
upstream families such as Combobox remain outside this update. Examples, site
blocks, questionnaire, and the CLI commands/MCP/schema runtime are also outside
the binding's component surface.

## Evidence and prior lineage

The new same-fixture differential cases compare Select controlled values,
Navigation Menu links and trigger state, and Scroll Area viewport/scrollbar
markup against the release's React implementations. Native tests additionally
exercise Select option selection, form submission and focus restoration,
Navigation Menu opening and Escape, no-browser-globals SSR, and Select hydration
adoption. Layout and pointer behavior in a real browser are not certified by
these DOM tests.

The existing five Radix differential cases retain their earlier component pin,
`4baadbc6517070ae8f8feb2c97037adc2b305544`, previously paired with CLI 4.14.1.
Dialog and Dropdown Menu use import-path-only references. Badge, Button, and
Tabs retain documented local class-hook adaptations, and IconPlaceholder is
resolved to Lucide. These references establish runtime equivalence under that
lineage; they do not certify every current upstream style. Existing derived Base
UI styles likewise retain their documented fidelity limits.

The original artifact hashes remain useful for that lineage: source archive
SHA-256 `015a8c4972120e794fa648ef6604fdd0ff94d4748c9308b0cfe147c177b5df4a`;
CLI 4.14.1 tarball SHA-256
`a264f1be8f1247c755e1186a0b3eba305fb581f04a4bfccf5077ea43a548256d`.

Native-input, descriptor `asChild`, icon-resolution, and Sonner-theme contracts
remain ordinary Octane tests, separate from the React differential cases.

## Updating

Verify the npm release's source commit and MIT license, compare the existing
component inventory, update pristine references only when their sources change,
regenerate the registry and coverage table, and rerun the package's interaction,
differential, SSR, hydration, type, and registry checks. Keep older reference
lineage explicit when local adaptations are retained.

The release CLI resolves the three new registry entries in a dry run. A full
external install also succeeds, creating all three wrappers and installing their
dependencies after the merged Base UI release was published.
