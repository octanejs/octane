// A reducer that reads only state infers `unknown` for its action, so its dispatch
// takes an optional argument and can be called with none, as React's types allow.
export type ReducerDispatch<A> = undefined extends A ? (action?: A) => void : (action: A) => void;
