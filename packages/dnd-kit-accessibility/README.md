# `@octanejs/dnd-kit-accessibility`

Screen-reader primitives for the legacy dnd kit API on Octane, ported from
`@dnd-kit/accessibility` 3.1.1: `HiddenText`, `LiveRegion`, and
`useAnnouncement`. `@octanejs/dnd-kit-core` renders them for drag announcements.

## Installation

```sh
npm install @octanejs/dnd-kit-accessibility octane
pnpm add @octanejs/dnd-kit-accessibility octane
```

Replace imports from `@dnd-kit/accessibility` with `@octanejs/dnd-kit-accessibility`;
[`@octanejs/codemod`](../codemod) rewrites them for you.

## Usage

```tsrx
import { LiveRegion, useAnnouncement } from '@octanejs/dnd-kit-accessibility';

export function Status() @{
  const { announce, announcement } = useAnnouncement();
  <>
    <button onClick={() => announce('Saved.')}>Save</button>
    <LiveRegion id="status" announcement={announcement} />
  </>
}
```

## About this port

This package is part of Octane's port of the legacy dnd kit API, the
`@dnd-kit/core` 6.x family: `@octanejs/dnd-kit-core`, `@octanejs/dnd-kit-sortable`,
`@octanejs/dnd-kit-modifiers`, `@octanejs/dnd-kit-utilities`, and
`@octanejs/dnd-kit-accessibility`, one per upstream package. For the modern
`@dnd-kit/react` API, use [`@octanejs/dnd-kit`](../dnd-kit).

Parity is `recorded-unverified`. Upstream's own unit tests are placeholders, so
each package runs them pristine and adapted, and a repo-authored differential test
runs the same fixtures against the published React package and compares the DOM
after every drag step. See [`UPSTREAM.md`](./UPSTREAM.md) for the pin and the
evidence.
