# @octanejs/filepond

Octane binding for [`react-filepond@7.1.3`](https://github.com/pqina/react-filepond). The vanilla `filepond@4.32.12` core is reused. The class wrapper is a function component.

## Installation

```sh
npm install @octanejs/filepond
pnpm add @octanejs/filepond
```

```tsrx
import { useRef } from 'octane';
import { FilePond, registerPlugin, type FilePondHandle } from '@octanejs/filepond';
import 'filepond/dist/filepond.min.css';

export function Uploader() @{
	const pondRef = useRef<FilePondHandle | null>(null);
	<FilePond ref={pondRef} allowMultiple={true} name="files" />
}
```

Imperative APIs live on the ref handle (`pondRef.current.pond`, plus copied instance methods), not on a class instance. See [UPSTREAM.md](./UPSTREAM.md).
