# Universal owner draft updates

This Node-only benchmark renders an object-driver root with zero, one, 128, or
1,024 keyed child components. Every update gives each child a new `version`
prop, so an unchanged-subtree shortcut cannot skip its owner draft. Each child
returns the same host and label; the parent exposes the current version.

The harness builds child renderables before timing, then measures accepted
updates through the public universal root. It checks the final version, every
child's last version and render count, host identities, structural commands,
and an output hash. Zero and one child are controls for root and host work.

```bash
node benchmarks/universal-owner-drafts/run.mjs 7
```

For same-toolchain source-bundle comparisons, set `BENCH_RUNTIME_URL` to the
absolute `file:` URL for an already built production `dist/universal.js`; this
skips the package build. The suite makes no browser, DOM, native-device, paint,
or application-wide throughput claim.
