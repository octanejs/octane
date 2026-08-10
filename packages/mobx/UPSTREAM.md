# MobX React Lite upstream contract

The React binding target is MIT-licensed `mobx-react-lite@4.1.1`, commit
`989de2d198e7a15c1fc1b981e1a96e50083ff2a0`, with npm archive SHA-256
`5f399b15e821be8674d185fdb810357e1147af7e69171e0438fc6e48034fe24e`.
The framework-neutral core remains `mobx@6.16.1` and is re-exported verbatim.

The Octane surface covers observer, Observer, useObserver,
useLocalObservable, and static-rendering controls. Legacy class components,
Provider/inject, forwardRef options, React batching/devtools, prop-types, and
debug-value behavior remain explicitly unsupported. The bounded shared lane
proves observer plus an internally owned local observable through an action
update. Pristine upstream suites are not yet adapted one-for-one, so the
manifest remains `recorded-unverified`.
