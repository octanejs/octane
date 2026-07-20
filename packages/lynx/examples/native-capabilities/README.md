# App-owned native capability example

This directory is an **illustrative integration skeleton**, not a runnable
fixture or native validation lane. It is excluded from `@octanejs/lynx`'s
published `files`, and the Octane repository does not compile or execute these
Android/iOS sources.

The files show the intended Milestone 4 ownership boundary:

- `src/native-capabilities.d.ts` augments Octane's background Native Module and
  renderer-local custom-element types;
- `src/App.lynx.tsrx` calls the module from a background event and authors the
  custom element;
- `native/platform-native-module.ts` is the app/library codegen declaration;
- `android/` and `ios/` contain app-owned implementations for the same
  `OctaneAccountModule` module and `octane-badge` element.

The type declaration and generated-spec seam follow the audited Lynx native
library shape. The Android/iOS registration markers follow the current official
[Native Libraries and Autolink](https://lynxjs.org/next/guide/autolink.html)
form; their availability in an application's exact SDK release must still be
verified. A real application must:

1. place these files in its own Lynx native library or host application;
2. run that library's Lynx codegen so `OctaneAccountModuleSpec` exists;
3. include the generated Android/iOS registration output in the app build;
4. register/link the library with the exact Lynx SDK used by the app;
5. build the Octane background entry with `native-capabilities.d.ts` included;
6. verify the module call, custom prop update, reload/destroy behavior, and
   cleanup on supported Android and iOS devices.

Those steps have **not** run in this repository. Successful TypeScript
augmentation and host transport tests prove only Octane's source boundary, not
native registration, generated bridge ABI, rendering, or lifecycle behavior.
Consult the exact SDK's Native Modules and custom-element documentation before
copying this skeleton because the Lynx native APIs are versioned independently
from Octane.

`createLynxNativeResource()` can encode an app resource reference as a
root-scoped serializable host prop. Resolving that identifier to an Android/iOS
object remains application-owned and is intentionally omitted here; passing a
live native object through the background transport is unsupported.
