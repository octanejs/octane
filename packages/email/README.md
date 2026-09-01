# @octanejs/email

Email-safe components from [React Email](https://github.com/resend/react-email), ported to Octane.

## Installation

```sh
npm install @octanejs/email
pnpm add @octanejs/email
```

```tsrx
import { Button, Html, render } from '@octanejs/email';

function Email(props: { url: string }) @{
	<Html><Button href={props.url}>Open</Button></Html>
}

const html = await render(Email, { url: 'https://example.com' });
```

The renderer accepts an Octane component and props because Octane server rendering uses component entry points. It returns XHTML Transitional email markup with no hydration markers.

Included primitives: `Body`, `Button`, `CodeInline`, `Column`, `Container`, `Font`, `Head`, `Heading`, `Hr`, `Html`, `Img`, `Link`, `Preview`, `Row`, `Section`, and `Text`.

Rich email authoring includes `Markdown`, Prism-powered `CodeBlock`, and `Tailwind`. Tailwind utilities are applied after static rendering, so classes inside ordinary nested `.tsrx` components are inlined correctly; responsive and pseudo rules are emitted into the document head.

Use `<Preview text="Inbox preview" />` and `<Markdown children={"# Hello"} />`. Octane's natural JSX children are render blocks, so text-inspecting components use explicit string props.

Template export and development tooling lives in `@octanejs/email-cli`.

Ported from React Email 6.9.2 at `ffe605819782b31d7f946e30f938b1b63e6b239c` (MIT).
