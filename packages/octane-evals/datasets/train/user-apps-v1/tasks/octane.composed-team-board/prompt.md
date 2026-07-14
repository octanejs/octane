# Compose a keyed team board

Create `src/App.tsrx` as a small team-recognition board. Keep these exports:

- the `Member` interface;
- the `MemberCard` component;
- the `TeamSummary` component; and
- the `App` component.

The board has two members in this initial order:

1. Ada — bio `Designs accessible systems`
2. Grace — bio `Operates cloud services`

Implement the following behavior:

- `App` owns each member's applause count, initially zero, and passes the
  current count and an update callback into each `MemberCard`.
- Each card owns whether its bio is open as local `useState` state. Its button
  is named `Show details NAME` while closed and `Hide details NAME` while open.
  Render the bio with TSRX `@if` only while open.
- Each card has a button named `Applaud twice NAME`. One native click must call
  the parent callback twice. Use a functional parent state update so both
  updates are retained even though they happen in one event handler.
- Render each count in an `<output>` named `Applause NAME`.
- Compose a `TeamSummary` that receives the total and renders it in an
  `<output>` named `Total applause`.
- Add a `Reverse team` button. Render the cards using keyed TSRX `@for`, keyed
  by member ID, so reversing the array preserves each card's DOM identity and
  local details state.

Use native `onClick` handlers and keep all implementation code in
`src/App.tsrx`. Do not add dependencies or modify the grader.
