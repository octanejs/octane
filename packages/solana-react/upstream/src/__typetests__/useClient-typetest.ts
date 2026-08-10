/* eslint-disable react-hooks/rules-of-hooks */

import type { Client } from '@solana/kit';

import { useClient } from '../useClient';

type ClientWithFoo = { foo: { hello(): string } };

// [DESCRIBE] useClient
{
    // It defaults to `Client<object>`
    {
        const client = useClient();
        client satisfies Client<object>;
        // @ts-expect-error - the base shape carries no plugin capabilities
        void client.foo;
    }

    // It narrows to the requested shape via the generic
    {
        const client = useClient<ClientWithFoo>();
        client satisfies Client<ClientWithFoo>;
        client.foo.hello() satisfies string;
        // @ts-expect-error - capability not declared in the generic
        void client.bar;
    }

    // The narrowed client retains the `use` method from `Client<TSelf>`
    {
        const client = useClient<ClientWithFoo>();
        client.use satisfies Client<ClientWithFoo>['use'];
    }
}
