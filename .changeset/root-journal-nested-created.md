---
'octane': patch
---

Stop journaling the creation and renders of a Block whose parent the same root
render created.

Every scheduled root render keeps an undo journal so it can roll back if it
suspends. It recorded a creation entry and a render entry for every Block it
created, including Blocks nested inside a parent it had also created, which a
rollback discards together with that parent. Those Blocks are no longer
recorded, including Blocks below a hookless child. After replaying the journal,
a rollback now unmounts every Block the render created that is still live. That
covers a Block its parent never linked, such as a portal whose content suspended
before its slot was registered. A boundary holding a transition keeps recording
everything inside its own window. During a rollback, the teardown callbacks of
these never-committed nested scopes, such as `nativeLocalHook` disposers, now
run parent first, as an ordinary unmount does, instead of in reverse creation
order.

A first mount of the 2,047-component `recursive-context` tree allocates 12% less
(4,028 KB to 3,545 KB per mount), and a cold `portal-swarm` mount is 12% faster.
Opening and closing portals under already mounted components is unchanged.
