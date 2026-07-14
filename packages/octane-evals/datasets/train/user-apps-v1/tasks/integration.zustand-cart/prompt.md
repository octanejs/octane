# Build a Zustand shopping cart

Implement the shopping cart in `src/App.tsrx` with `@octanejs/zustand`.

The catalogue contains Coffee (£12.50) and Tea (£5.00). The app must:

- expose accessible `Add Coffee` and `Add Tea` buttons;
- add or increment products in a module-level Zustand store;
- render each line as `Name × quantity` in catalogue order;
- expose an accessible `Decrease Name` button for every line and remove the
  line when its quantity reaches zero;
- display the exact total as `Total: £0.00`, `Total: £12.50`, and so on;
- provide a `Clear cart` button and show `Cart empty` when no lines remain; and
- preserve the cart if the `App` component is unmounted and mounted again.

Use the real `@octanejs/zustand` API. Do not use component-local state as the
source of truth. Only edit `src/App.tsrx`.
