import { atom } from 'nanostores';
import { createAuthClient as createVanillaAuthClient } from 'better-auth/client';
import { createAuthClient, useStore } from '../src/index';

type Equal<Left, Right> =
	(<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
		? true
		: false;
type Expect<Value extends true> = Value;

const organizationPlugin = {
	id: 'organization-types',
	getAtoms: () => ({ activeOrganization: atom('alpha') }),
} as const;

const client = createAuthClient({ plugins: [organizationPlugin] });
const vanillaClient = createVanillaAuthClient({
	plugins: [organizationPlugin],
});

type Session = ReturnType<typeof client.useSession>;

type _SessionPending = Expect<Equal<Session['isPending'], boolean>>;

const activeOrganization: string = client.useActiveOrganization();
// @ts-expect-error plugin atom hooks retain their value type
const invalidOrganization: number = client.useActiveOrganization();
// @ts-expect-error upstream vanilla atom retains its value type
const invalidVanillaOrganization: number = vanillaClient.useActiveOrganization.get();

client.signIn.email({
	email: 'ada@example.com',
	password: 'secret-password',
});

const fetchClient = client.$fetch;
const storeAtoms = client.$store.atoms;
const errorCodes = client.$ERROR_CODES;
const inferredSession: typeof client.$Infer.Session | null = null;
void fetchClient;
void storeAtoms;
void errorCodes;
void inferredSession;

const numberStore = atom(1);
useStore(numberStore, { deps: [numberStore] as const });
