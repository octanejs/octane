---
'@octanejs/lynx': patch
---

Skip prop-patch planning for hosts that own nothing on the main thread when
capturing the Lynx first tree.

First-tree capture re-plans every painted host's props, but only to recover what
the main thread should own — a `main-thread:` event handler or `main-thread:ref`.
Those are the only two ways to declare main-thread ownership and both carry the
`main-thread:` prefix, so a host without one can be answered by a prop-name test
instead of a full patch plan. The checks around it are unchanged: a host that
never asked for main-thread ownership must still have none mounted.

Capture runs after the page is already published to the host, so everything it
does sits between the tree reaching the DOM and the browser painting it. In the
`lynx-table` benchmark's 10,000-row first screen no host declares a
`main-thread:` prop, so all 70,041 of them now skip planning: the capture-time
planning cost drops from a 58.3 ms median to 28.8 ms on the same instrument. The
end-to-end first-paint effect is roughly 1.7% there, below what that harness can
resolve on a noisy host.
