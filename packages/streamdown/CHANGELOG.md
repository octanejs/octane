# @octanejs/streamdown

## 0.1.1

### Patch Changes

- 42b4b75: Avoid rendering empty code block action chrome when every code control is disabled.
- 42b4b75: Add a complete Streamdown 2.5.0 binding for Octane.

  The root entry ports Streamdown's streaming and static Markdown renderer,
  contexts, controls, code blocks, tables, images, custom renderers, animation,
  SSR, and hydration without a React runtime dependency. The official code,
  math, Mermaid, and CJK plugins are available through `./code`, `./math`,
  `./mermaid`, and `./cjk`. Published and locally linked consumers receive
  precompiled client and server JavaScript plus declarations instead of raw TSRX
  source.

- Updated dependencies [43df1f9]
- Updated dependencies [7a112b4]
  - octane@0.1.22
