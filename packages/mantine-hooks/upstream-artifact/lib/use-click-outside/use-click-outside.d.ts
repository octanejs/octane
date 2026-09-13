type EventType = MouseEvent | TouchEvent;
export declare function useClickOutside<T extends HTMLElement = any>(callback: (event: EventType) => void, events?: string[] | null, nodes?: (HTMLElement | null)[], enabled?: boolean): import("react").RefObject<T | null>;
export {};
