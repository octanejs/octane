# @octanejs/html-react-parser

Octane binding for [`html-react-parser@6.1.7`](https://github.com/remarkablemark/html-react-parser).

## Installation

```sh
npm install @octanejs/html-react-parser
pnpm add @octanejs/html-react-parser
```

```ts
import parse from '@octanejs/html-react-parser';

const tree = parse('<p>hello <em>world</em></p>');
```

The default `library` is Octane `createElement` / `cloneElement` / `isValidElement`. See [UPSTREAM.md](./UPSTREAM.md).
