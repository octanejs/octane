# @octanejs/select

An Octane binding for [`react-select@5.10.2`](https://github.com/JedWatson/react-select/tree/052e864b4990a67c4ee416851c34d1eb7b58267b).

## Installation

```sh
npm install @octanejs/select
pnpm add @octanejs/select
```

The package preserves React Select's root, `base`, `async`, `animated`, `creatable`, and `async-creatable` entry points. Its default styles, component replacement contract, state management, asynchronous loading, creatable options, transitions, accessibility markup, keyboard/pointer/touch behavior, portals, and CSP nonce support are covered by executable React-oracle tests.

```tsrx
import Select from '@octanejs/select';

const options = [
	{ value: 'chocolate', label: 'Chocolate' },
	{ value: 'strawberry', label: 'Strawberry' },
	{ value: 'vanilla', label: 'Vanilla' },
];

export function FlavorPicker() {
	return <Select options={options} />;
}
```

The public API follows the pinned React package. Import optional variants through the equivalent subpaths:

```ts
import AsyncSelect from '@octanejs/select/async';
import makeAnimated from '@octanejs/select/animated';
import CreatableSelect from '@octanejs/select/creatable';
import AsyncCreatableSelect from '@octanejs/select/async-creatable';
```

The animated entry point uses `@octanejs/transition-group`; consumers do not need to configure it separately.

See [UPSTREAM.md](./UPSTREAM.md) for the exact source pin, public-surface crosswalk, retained upstream evidence, and verification commands.

## License

MIT. The pinned upstream notice is retained in [LICENSE](./LICENSE).
