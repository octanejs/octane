---
name: react-library-port
description: Compatibility entry point for React-library work in Octane; routes existing-binding maintenance to update-bindings and actual React implementation ports to octane-react-library-port.
---
# React library port compatibility entry point

This is the stable legacy entry point for React-library binding work.

For existing-binding audits, maintenance, lifecycle fixes, dependency/metadata
updates, convenience imports, or reduction, load and follow
[update-bindings](../update-bindings/SKILL.md). A missing convenience wrapper does
not justify porting framework-neutral code available through a direct import.

For a new React-library port or actual copied/rewritten React implementation, load
and follow [octane-react-library-port](../octane-react-library-port/SKILL.md).
Preserve supplied library names, versions, and npm/GitHub inputs. Its implementation,
verification, and terminal requirements apply to that port; routing alone does not
complete an authorized implementation. Preserve the user's scope and any existing
shipping authorization.
