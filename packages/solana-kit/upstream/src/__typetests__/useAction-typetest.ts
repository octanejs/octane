/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable react-hooks/rules-of-hooks */

import { ActionResult, useAction } from '../useAction';

// [DESCRIBE] useAction
{
    // It infers TArgs and TResult from the wrapped function
    {
        const result = useAction(async (_signal: AbortSignal, value: number) => `n=${value}`);
        result satisfies ActionResult<[value: number], string>;
        result.dispatch(7) satisfies void;
        result.dispatchAsync(7) satisfies Promise<string>;
        result.data satisfies string | undefined;
    }

    // The status field is a discriminated string union, not a generic string
    {
        const fn = (): Promise<number> => Promise.resolve(1);
        const { status } = useAction(fn);
        status satisfies 'error' | 'idle' | 'running' | 'success';
        // @ts-expect-error - 'pending' is not a valid status
        status satisfies 'pending';
    }

    // dispatch / dispatchAsync reject calls that pass the wrong argument types
    {
        const { dispatch, dispatchAsync } = useAction(async (_signal: AbortSignal, _value: number) => 0);
        dispatch(1);
        dispatchAsync(1);
        // @ts-expect-error - argument should be a number
        dispatch('not a number');
        // @ts-expect-error - argument should be a number
        dispatchAsync('not a number');
    }

    // Zero-argument actions get a zero-argument dispatch / dispatchAsync
    {
        const fn = (): Promise<string> => Promise.resolve('ok');
        const { dispatch, dispatchAsync } = useAction(fn);
        dispatch() satisfies void;
        dispatchAsync() satisfies Promise<string>;
        // @ts-expect-error - dispatch takes no arguments
        dispatch('extra');
        // @ts-expect-error - dispatchAsync takes no arguments
        dispatchAsync('extra');
    }
}
