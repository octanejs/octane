---
'@octanejs/lexical': minor
---

Update the Lexical binding to Lexical 0.51.0. It ports the upstream `@lexical/react` fixes:

- Menus let arrow and Escape keys through when the default renderer has nothing to show, and position correctly inside a positioned parent.
- The typeahead query updates during IME composition.
- AutoEmbed opens only for a bare pasted link.
- The character limit is counted on mount and handles block separators and adjacent overflow.
- Decorators re-render after the editor root remounts.
- Read-only editors get `tabindex="-1"`.
- Deselecting an unselected node keeps the caret.
- The node context menu defers to the browser when it has no items.
- The draggable block restores focus after a drag.

It also adds the new `LexicalMenuOption` and `*Utils` entry points and the `@lexical/a11y`-backed `useLexicalAriaLiveRegion`, `useLexicalFocusManagerRef`, `useLexicalFocusTrapRef`, and `useLexicalRovingTabIndexRef` hooks.
