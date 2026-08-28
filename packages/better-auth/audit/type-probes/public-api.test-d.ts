import { atom } from 'nanostores';
import { createAuthClient, useStore } from 'better-auth/react';

function expectType<Value>(_value: Value): void {}

const organizationPlugin = {
	id: 'organization-types',
	getAtoms: () => ({ activeOrganization: atom('alpha') }),
	getActions: () => ({
		useWidget: {
			get: () => 'action-result',
			listen: () => () => {},
		},
	}),
} as const;

const client = createAuthClient({ plugins: [organizationPlugin] });

expectType<boolean>(client.useSession().isPending);
expectType<string>(client.useActiveOrganization());
expectType<string>(client.useWidget.get());
expectType(client.$fetch);
expectType(client.$store.atoms);
expectType(client.$ERROR_CODES);

const inferredSession: typeof client.$Infer.Session | null = null;
expectType<typeof client.$Infer.Session | null>(inferredSession);

client.signIn.email({
	email: 'ada@example.com',
	password: 'secret-password',
});

const numberStore = atom(1);
expectType<number>(useStore(numberStore, { deps: [numberStore] as const }));

// @ts-expect-error plugin atom hooks retain their value type
const invalidOrganization: number = client.useActiveOrganization();
void invalidOrganization;
