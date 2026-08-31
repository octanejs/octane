# streamdown-hosted

This suite measures the React-hosted Streamdown replacement boundary:

- `react-streamdown`: React 19 renders upstream `streamdown@2.5.0` directly.
- `octane-streamdown`: the same React 19 host renders
  `@octanejs/streamdown` through `OctaneCompat`.

This is specifically an `OctaneCompat` comparison. The separate
[`ReactCompat` benchmark](../octane-hosted-react/README.md) measures a generic
React counter inside Octane; it does not measure Streamdown in that direction.
See the [React compatibility guide](https://octanejs.dev/docs/react-compat) for
both integration APIs.

Both production Vite builds receive the same Markdown, props, plugin
configuration, and synchronous host update sequence. The timed operations are:

| operation | workload |
| --- | --- |
| `mountStatic` | mount one mixed static document eight times |
| `replaceStatic` | replace an already-mounted mixed document eight times |
| `streamFine` | grow streaming Markdown in 32-character commits |
| `streamCoarse` | grow the same Markdown in 256-character commits |

`controls`, animation, and line numbers are disabled so the measurements focus
on parsing and rendering rather than clipboard/download UI. The math and Shiki
code plugins remain enabled because they represent the common production plugin
shape.

Streaming frames are strict prefixes of the final document, matching an
append-only token stream. The final commit marker is part of the Markdown
corpus; the harness does not inject and remove synthetic text between frames.

Before reporting timings, the harness requires both targets to produce the same
normalized visible text, headings, paragraphs, lists, tables, links, code
blocks, and KaTeX node counts. It also reports production JS/CSS raw and gzip
bytes. Framework-private wrapper/comment nodes are not treated as semantic
differences. The semantic check waits for every non-empty corpus code block to
finish its asynchronous Shiki render; that wait is outside the timed operation
and has a hard timeout.

The suite intentionally does not fold a static replacement immediately after
incomplete-code streaming into a timing score. That sequence is a lifecycle
correctness gate, not a stable performance operation. It is reported as
`stream → static` separately from the timings, and either target failing to
commit it without browser errors marks the harness failed and exits non-zero.

Run it through the unified runner:

```bash
node benchmarks/bench.mjs --quick streamdown-hosted
node benchmarks/bench.mjs streamdown-hosted
```

The headline numbers are comparative results from the same machine and browser
run. They are not portable absolute performance claims.
