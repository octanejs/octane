---
'octane': patch
---

Let controlled selects preserve a browser choice across the native input/change event pair so `onChange` observes the selected value, and keep capture/bubble handlers in one discrete update window so capture work cannot restore the old choice before bubbling.
