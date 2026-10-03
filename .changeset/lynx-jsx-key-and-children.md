---
'@octanejs/lynx': patch
---

Accept `key` on Lynx components and native elements, and check authored JSX
children against a component's `children` prop.

A keyed `@for` row or `<Row key="x" />` in a `.lynx.tsrx` or Lynx `.tsx` file no
longer reports that `key` does not exist on the props. Under `jsx: preserve`,
children written between a component's tags now satisfy a required `children`
prop and are type-checked against it.
