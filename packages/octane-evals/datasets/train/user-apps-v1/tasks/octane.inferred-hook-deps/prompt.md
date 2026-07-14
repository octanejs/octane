# Derive a live invoice with inferred hook dependencies

Implement `src/App.tsrx` and export a component named `App` with these props:

```ts
{
	quantity: number;
	unitPrice: number;
	discount: number;
	onTotal: (total: number) => void;
}
```

This task exercises Octane's compiler-inferred dependencies. In React, omitting
a dependency array makes an effect run after every render. In Octane, omission
asks the compiler to derive the dependencies from lexical captures.

Requirements:

- Compute `subtotal` as `quantity * unitPrice` with `useMemo`.
- Compute `total` as `Math.max(0, subtotal - discount)` with a second `useMemo`.
- Omit the dependency array from both `useMemo` calls. Do not manually write an
  array or pass `null`.
- Call `onTotal(total)` from a `useEffect`, also with its dependency array
  omitted. The effect must react to both the total and a replacement `onTotal`
  callback, while avoiding unrelated repeats.
- Render the quantity in an output labelled `Quantity`, the subtotal in an
  output labelled `Subtotal`, and the total in an output labelled `Total`.
- Format subtotal and total as fixed two-decimal strings without a currency
  symbol.

Keep all implementation code in `src/App.tsrx`. Do not add dependencies or edit
the grader.
