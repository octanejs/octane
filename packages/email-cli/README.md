# @octanejs/email-cli

Develop and compile Octane `.tsrx` email templates.

## Installation

```sh
npm install --save-dev @octanejs/email-cli
pnpm add --save-dev @octanejs/email-cli
```

```sh
octane-email dev --dir ./emails
```

The development server lists nested templates at `http://127.0.0.1:3000`, renders a
selected template through `@octanejs/email`, serves `emails/static`, and reloads the
page when templates or assets change. Compilation and rendering errors appear in the
preview while the server stays running. Use `--host` and `--port` to change its address.

```sh
octane-email export --dir ./emails --outDir ./out
```

Each template must default-export an Octane component. The export command retains nested
paths, renders through `@octanejs/email`, and copies `emails/static` to `out/static`.

Options include `--pretty` and `--extension <suffix>`.
