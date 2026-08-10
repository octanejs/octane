---
'@octanejs/transition-group': patch
---

Commit ENTERING/EXITING before onEntering/onExiting so status is observable, and refresh exit/enter flags when a TransitionGroup child starts leaving so exit can be re-enabled mid-list.
