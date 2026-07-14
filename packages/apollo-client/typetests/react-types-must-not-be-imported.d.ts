// The typetest config maps `react` here. Any public declaration that reaches for
// a React type such as ReactNode, Context, or FC will fail with a missing export.
export type ReactTypesMustNotBeImported = never;
