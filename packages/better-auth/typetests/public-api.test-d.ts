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
	getActions: () => ({ useWidget: () => 'action-result' as const }),
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

type _WidgetResult = Expect<Equal<ReturnType<typeof client.useWidget>, 'action-result'>>;

client.signIn.email({
	email: 'ada@example.com',
	password: 'secret-password',
});

type _Fetch = Expect<Equal<typeof client.$fetch, typeof vanillaClient.$fetch>>;
type _StoreAtoms = Expect<Equal<typeof client.$store.atoms, typeof vanillaClient.$store.atoms>>;
type _ErrorCodes = Expect<Equal<typeof client.$ERROR_CODES, typeof vanillaClient.$ERROR_CODES>>;
type _InferredSession = Expect<
	Equal<typeof client.$Infer.Session, typeof vanillaClient.$Infer.Session>
>;

const numberStore = atom(1);
useStore(numberStore, { deps: [numberStore] as const });
