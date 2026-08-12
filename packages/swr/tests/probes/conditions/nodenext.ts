import useSWR, { SWRConfig, type SWRConfiguration } from '@octanejs/swr';
import useSWRInfinite, { type SWRInfiniteConfiguration } from '@octanejs/swr/infinite';
import useSWRImmutable from '@octanejs/swr/immutable';
import useSWRMutation from '@octanejs/swr/mutation';
import useSWRSubscription from '@octanejs/swr/subscription';
import { stableHash, type Fetcher } from '@octanejs/swr/_internal';

void [
	useSWR,
	SWRConfig,
	useSWRInfinite,
	useSWRImmutable,
	useSWRMutation,
	useSWRSubscription,
	stableHash,
];
const values: [SWRConfiguration, SWRInfiniteConfiguration, Fetcher] = [{}, {}, () => undefined];
void values;
