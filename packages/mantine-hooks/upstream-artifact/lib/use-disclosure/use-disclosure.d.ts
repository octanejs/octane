export interface UseDisclosureOptions {
    onOpen?: () => void;
    onClose?: () => void;
}
export interface UseDisclosureHandlers {
    set: (value: boolean) => void;
    open: () => void;
    close: () => void;
    toggle: () => void;
}
export type UseDisclosureReturnValue = [boolean, UseDisclosureHandlers];
export declare function useDisclosure(initialState?: boolean, options?: UseDisclosureOptions): UseDisclosureReturnValue;
export declare namespace useDisclosure {
    type Options = UseDisclosureOptions;
    type Handlers = UseDisclosureHandlers;
    type ReturnValue = UseDisclosureReturnValue;
}
