import type { ReactiveVar } from '@apollo/client';
/**
 * Reads the value of a [reactive variable](https://www.apollographql.com/docs/react/local-state/reactive-variables/) and re-renders the containing component whenever that variable's value changes. This enables a reactive variable to trigger changes _without_ relying on the `useQuery` hook.
 *
 * @example
 *
 * ```jsx
 * import { makeVar } from "@apollo/client";
 * import { useReactiveVar } from "@octanejs/apollo-client/react";
 * export const cartItemsVar = makeVar([]);
 *
 * export function Cart() {
 *   const cartItems = useReactiveVar(cartItemsVar);
 *   // ...
 * }
 * ```
 *
 * @param rv - A reactive variable.
 * @returns The current value of the reactive variable.
 */
export declare function useReactiveVar<T>(rv: ReactiveVar<T>): T;
