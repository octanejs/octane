---
'@octanejs/shadcn': patch
---

Add `table` to the Base UI base, at `@octanejs/shadcn/base-ui/Table`. That base now covers 29 of 44
families.

This family is base-independent: neither Radix nor Base UI publishes a table primitive, so upstream
ships the same plain host elements in both and this file carries the Radix one unchanged. A
differential test renders the same markup through both bases and asserts identical DOM, so the two
cannot drift apart unnoticed. (The React Aria base is the exception — RAC does have a table, so it
runs on real collection components with generic item types.)

`data-[state=selected]` on the row is written by the consumer rather than emitted by a primitive,
so unlike `checkbox` or `toggle` it needed no dialect translation.
