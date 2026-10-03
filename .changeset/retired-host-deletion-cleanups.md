---
'octane': patch
---

Skip removed hosts' handlers when a deletion cleanup moves focus before the
teardown reaches them.

Deletion cleanups run parent first. A dialog that restores focus in its own
layout cleanup used to start `onBlur` on an input owned by a child component
that the teardown had not reached yet. The same happened for an input in a
removed `@for` row's value hole when an earlier component in the row moved
focus. A deletion now retires every host it removes before any of its cleanups
run, including a portal's content. Live hosts, including focused siblings of
the removed range, still receive the event.

Handler publication no longer records an owner on each host, and a list clear
retires only the row that holds focus.
