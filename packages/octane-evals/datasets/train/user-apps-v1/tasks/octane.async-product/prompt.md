# Suspense product details

Implement `src/App.tsrx` as an asynchronous product-details panel.

The module must continue to export the `Product` interface and `App` component.

Requirements:

- `App` receives a `productId` and a `loadProduct(id)` function.
- Start the request by calling `loadProduct` with the active product ID and
  unwrap it with Octane's `use()` API.
- Use TSRX `@try`, `@pending`, and `@catch` arms.
- While pending, render `.loading` with the text `Loading product…`.
- On success, render an `<article class="product">` whose `data-product-id`
  matches the product. It contains the product name in an `<h2>` and its price
  in `.price`, formatted as dollars with exactly two decimal places.
- On rejection, remove the loading and success content and render a
  `role="alert"` element with class `error` containing the original error
  message. Non-Error rejection values must be converted with `String(...)`.
- Re-rendering with the same ID must not recreate the request. Changing the ID
  must start the new request and show the pending arm again.

Do not edit the grader or add dependencies.
