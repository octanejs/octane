# Frozen react-markdown adoption corpus

## Inputs

1. `canonical/react-markdown-examples.react.tsx` freezes default/named exports,
   all six public type families through `Components` and `Options`, plugin
   tuples, intrinsic/custom mappings, node destructuring, sync rendering,
   awaited rendering, hooks fallback, and URL transformation from the pinned
   public contract.
2. `public-app/MarkdownBlock.react.tsx` is byte-exact from
   `zgsm-ai/costrict` commit `d947265becb36826e321609b118b71f0415746e7`, path
   `webview-ui/src/components/common/MarkdownBlock.tsx`, blob
   `bb0009711c9e51b435a26b2d86dedd06702084ac`. The repository is Apache-2.0.
   It supplies a real application boundary with default import, remark/rehype
   plugin tuples, component mappings, intrinsic prop forwarding, raw HTML,
   sanitization, and a custom URL transform.

## Edit ledger

| Class | Frozen edit | Library-specific redesign? |
| --- | --- | --- |
| Dependency mapping | `react-markdown` → `@octanejs/markdown` | No; declared package mapping |
| Import mapping | change only the package root | No; declared package mapping |
| Framework syntax | `.tsx` JSX → `.tsrx` templates | No; ordinary React-to-Octane conversion |
| Framework type | React renderable/event/intrinsic types → Octane/native equivalents | No; ordinary framework conversion |
| Host props | `className` → `class`; native text events use `onInput` where applicable | No; documented Octane host seam |
| Refs | React forwarding patterns → ref-as-prop | No; documented Octane host seam |
| `Markdown`, `MarkdownAsync`, `MarkdownHooks` | names, options, return model, and fallback retained | Must remain unchanged |
| Unified plugins | plugin values and tuples retained | Must remain unchanged |
| Component mappings | keys, callback props, `node`, nullability, and intrinsic forwarding retained | Must remain unchanged |
| Filtering and URL APIs | callback signatures and ordering retained | Must remain unchanged |

The completed port requires no new renderer API, changed plugin shape, changed
component keys or props, rewritten callback contract, or other
react-markdown-specific consumer edit. The executable Octane consumer imports
the public package entry point and exercises the synchronous, awaited, and hooks
models with the same plugins, components, options, and exported types. The
public-app fixture remains byte-exact as the attributable real-world baseline.

Keep `Markdown` in React-style value position, such as
`return <Markdown>{markdown}</Markdown>`, so static and expression children remain
inspectable values. Octane template-position children compile to an opaque render
block and cannot be used as Markdown source; pass `children={markdown}` explicitly
when value-position JSX is not convenient.
