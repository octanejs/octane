import { SWRConfig, unstable_serialize } from '@octanejs/swr';
import { unstable_serialize as serializeInfinite } from '@octanejs/swr/infinite';
import { INFINITE_PREFIX, serialize } from '@octanejs/swr/_internal';
void [SWRConfig, unstable_serialize, serializeInfinite, INFINITE_PREFIX, serialize];

// @ts-expect-error default root hook is intentionally omitted by react-server.
import useSWR from '@octanejs/swr';
// @ts-expect-error infinite hook is intentionally omitted by react-server.
import useSWRInfinite from '@octanejs/swr/infinite';
// @ts-expect-error mutation is intentionally omitted by react-server.
import { mutate } from '@octanejs/swr/_internal';
void [useSWR, useSWRInfinite, mutate];
