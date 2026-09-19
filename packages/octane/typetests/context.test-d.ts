import { createContext } from 'octane';
import { createContext as createServerContext } from 'octane/server';
import { createContext as createNativeContext } from 'octane/universal/native';

const client = createContext('default');
const server = createServerContext('default');
const native = createNativeContext('default');

// @ts-expect-error Contexts are provided directly, without a Provider alias.
client.Provider;
// @ts-expect-error The server has the same direct-context public API.
server.Provider;
// @ts-expect-error Native contexts also have no Provider alias.
native.Provider;
