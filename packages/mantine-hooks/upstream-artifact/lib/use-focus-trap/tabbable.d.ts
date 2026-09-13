export declare const FOCUS_SELECTOR = "a, input, select, textarea, button, object, [tabindex]";
export declare function focusable(element: HTMLElement): boolean | "";
export declare function tabbable(element: HTMLElement): boolean | "";
export declare function findTabbableDescendants(element: HTMLElement): HTMLElement[];
