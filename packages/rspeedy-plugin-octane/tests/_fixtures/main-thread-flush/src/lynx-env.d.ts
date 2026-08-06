/**
 * Element PAPI functions exist only in the Lynx main-thread runtime and may be
 * referenced only inside `'main thread'` functions.
 */
declare function __AddInlineStyle(element: object, name: string, value: string): void;
declare function __FlushElementTree(): void;
