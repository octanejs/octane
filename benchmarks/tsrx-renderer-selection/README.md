# TSRX renderer selection

Measure repeated filename-to-renderer classification through the public
`octane/compiler/renderers` entry. The workload uses one realistic ordered
configuration with early and late matches, exclusions, defaults, brace expansion,
character classes, Windows separators, and bundler suffixes.

The two targets perform the same classifications and must produce the same
renderer-ID checksum:

- `raw-config` passes mutable configuration and intentionally pays validation on
  every resolution.
- `normalized-config` reuses one validated configuration, matching compiler and
  language-tool integrations that retain normalized options across many modules.

```bash
node benchmarks/bench.mjs --quick tsrx-renderer-selection
node benchmarks/bench.mjs --quick --ratios tsrx-renderer-selection
```

A regression in the normalized target points at renderer configuration reuse or
glob matcher retention. A checksum failure means the targets stopped doing the
same semantic work, so the timing result is rejected.
