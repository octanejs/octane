# `@octanejs/dropzone`

The exact `react-dropzone@20.0.0` file-acquisition API, ported to Octane. It
supports click and keyboard selection, drag and drop, paste, File System Access,
accepted/rejected files, synchronous or asynchronous validators, superseding
stale async work, and programmatic dialog opening. It never uploads files.

## Installation

```sh
npm install @octanejs/dropzone
pnpm add @octanejs/dropzone
```

```tsrx
import { useDropzone } from '@octanejs/dropzone';

export function FilePicker() @{
  const dropzone = useDropzone({
    accept: { 'image/*': ['.png', '.jpg', '.jpeg'] },
    maxFiles: 3,
    onDropAccepted(files) {
      console.log(files.map((file) => file.name));
    },
  });

  <section {...dropzone.getRootProps()}>
    <input {...dropzone.getInputProps()} />
    <p>{dropzone.isProcessing ? 'Checking files…' : 'Drop images or choose files'}</p>
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        dropzone.open();
      }}
    >Choose files</button>
  </section>
}
```

## Migrate from React

Replace the package import and convert JSX/components to TSRX. The root export,
default `Dropzone` component, `useDropzone`, `ErrorCode`, option names, callback
payloads, getter contract, ref contract, and public types match the pinned
upstream release.

```diff
- import { useDropzone } from 'react-dropzone';
+ import { useDropzone } from '@octanejs/dropzone';
```

The binding publishes only the root entry and `./package.json`, matching
upstream. It requires Node 22 or newer for tooling and an Octane application at
runtime. Browser support follows the platform file, drag-and-drop, clipboard,
and File System Access APIs used by the selected options; File System Access is
feature-detected and falls back to the hidden file input where appropriate.

File names, paths, MIME types, and file contents can be sensitive. Validate
again at the trust boundary, do not infer safety from extensions or browser MIME
metadata, and upload only after explicit user intent. See [UPSTREAM.md](./UPSTREAM.md)
for the immutable source and artifact provenance.
