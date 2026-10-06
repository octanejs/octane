---
'octane': patch
---

Hydrating a form control now projects a value or checked state that the client renders differently from the server, as React 19 does. The client value becomes the control's reset baseline: the `value` attribute of an `<input>`, the content of a `<textarea>`, and the `checked` attribute of a checkbox or radio, whether controlled or set with `defaultChecked`. An input or textarea the user has not edited shows the client value, so a controlled control no longer displays the server's value while its state holds another. A value the user typed before hydration is kept until the control's first commit or discrete event, and a checkbox keeps its live checked state. A hydration whose values match the server's still writes nothing to the DOM.
