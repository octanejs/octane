# Load an independent dashboard without a Suspense waterfall

Implement `src/App.tsrx` and export `App` plus the `Team` and `TeamStats`
interfaces shown below:

```ts
interface Team {
	id: string;
	name: string;
}

interface TeamStats {
	open: number;
	closed: number;
}

{
	teamId: string;
	loadTeam: (teamId: string) => Promise<Team>;
	loadStats: (teamId: string) => Promise<TeamStats>;
}
```

This task exercises Octane's default parallel-`use()` transform. Two independent
promise creations in one component body are memoized and started together before
the boundary suspends. Equivalent sequential React code waterfalls unless the
author manually starts both promises first.

Requirements:

- Put both reads in one `@try` block. Read the team with
  `use(loadTeam(teamId))`, then read its independent stats with
  `use(loadStats(teamId))`.
- Keep the authoring sequential and direct. Do not manually coordinate with
  `Promise.all`, `useMemo`, module caches, or effects.
- Both loaders must be called before either promise resolves.
- Promise creation must remain stable across Suspense replay: each loader is
  called once for a given `teamId` and loader identity.
- The `@pending` arm renders `Loading dashboard…` in an element with
  `role="status"`.
- Once both values resolve, render an article labelled `Team dashboard`, with
  the team name as a heading and outputs labelled `Open issues` and
  `Closed issues`.
- The success article must not appear while either value is still pending.
- The `@catch` arm renders `Could not load dashboard: <message>` in an element
  with `role="alert"`.

Keep all implementation code in `src/App.tsrx`. Do not add dependencies or edit
the grader.
