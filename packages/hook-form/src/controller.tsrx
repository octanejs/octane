// Vendored from react-hook-form@7.81.0 src/controller.tsx (octane port).
// Component based on `useController` to work with controlled components.
// Authored as .tsrx (full compile) — a component in binding src must have its
// custom-hook call slot-wrapped by the compiler; the plain-.ts slotting pass
// only slots BASE octane hooks (see compiler/slot-hooks.js).
import { useController } from './useController.ts';

export const Controller = (props) => props.render(useController(props));
