# User-app task scoring

A task is resolved only when every task-specific behavior test and declared
source contract passes against the submitted application file. Source contracts
are used only when the named competency is an Octane syntax or API pattern that
cannot be distinguished by rendered behavior alone. Formatting, generated-code
shape, and reference-solution similarity do not affect the score. Parse or
compile errors, uncaught runtime errors, timeouts, and any failed assertion make
the task unresolved.

The committed reference projects are public training targets and corpus
regression fixtures. They are never copied into a candidate workspace.
