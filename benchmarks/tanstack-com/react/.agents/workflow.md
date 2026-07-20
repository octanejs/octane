# Workflow

## Build Commands

- `pnpm test`: Run at end of task batches
- `pnpm build`: Only for build/bundler issues or verifying production output
- `pnpm lint`: Check for code issues
- `dev` runs indefinitely in watch mode

Don't build after every change. This is a visual site; assume changes work.

## Dev Authentication

The dev server uses the real production database and OAuth. There are no auth bypasses.

To authenticate a dev session, the human must run:

```sh
pnpm auth:login
```

This opens `tanstack.com`, completes OAuth, and saves `DEV_SESSION_TOKEN` to `.env.local`. The dev server then auto-injects that token as a session cookie on startup.

If the user asks for help with anything requiring authentication (account pages, admin, mutations) and `DEV_SESSION_TOKEN` is not set in `.env.local`, tell them to run `pnpm auth:login` first and restart the dev server.

## Debugging Visual Issues

When something doesn't work or look right:

1. Use Playwright MCP to view the page and debug visually
2. Use `pnpm build` only for build/bundler issues
3. Use `pnpm lint` for code issues

## Playwright

Playwright is available via `npx playwright` and should be used freely to interact with the running dev server like a human would. This includes testing, debugging, visual verification, design iteration, and general development workflows.

Since the dev server runs with a real authenticated session (via `DEV_SESSION_TOKEN`), Playwright has full access to gated pages, account features, admin areas, and authenticated mutations — exactly as the signed-in user would.

Common uses:

- `npx playwright screenshot <url> <file>` — capture current state of any page
- Navigate to a page, interact with elements, re-screenshot to verify changes
- Debug layout/visual issues without needing a human to look
- Verify authenticated flows end-to-end (account, showcase submissions, admin, etc.)
- Iterate on UI by screenshotting, editing, screenshotting again
