export interface UseQueueOptions<T> {
    /** Initial values to be added to the queue */
    initialValues?: T[];
    /** Maximum number of items in the state */
    limit: number;
}
export interface UseQueueReturnValue<T> {
    /** Array of items in the queue */
    queue: T[];
    /** Array of items in the state */
    state: T[];
    /** Function to add items to state or queue */
    add: (...items: T[]) => void;
    /** Function to apply updates to current items */
    update: (fn: (state: T[]) => T[]) => void;
    /** Function to clear the queue */
    cleanQueue: () => void;
}
export declare function useQueue<T>({ initialValues, limit, }: UseQueueOptions<T>): UseQueueReturnValue<T>;
export declare namespace useQueue {
    type Options<T> = UseQueueOptions<T>;
    type ReturnValue<T> = UseQueueReturnValue<T>;
}
