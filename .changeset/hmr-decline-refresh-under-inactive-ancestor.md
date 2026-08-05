---
'octane': patch
---

Editing a component inside a hidden `<Activity>` no longer makes it appear on
screen. That DOM is stamped `display: none` by a walk that only runs when the
Activity slot re-renders, so the hot refresh was inserting unstamped nodes and
revealing a tree the user is not meant to see. The refresh now declines for
components under an inactive ancestor and the bundler reloads the page.
