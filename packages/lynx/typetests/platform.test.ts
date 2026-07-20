import {
	getLynx,
	getNativeModules,
	reload,
	reportError,
	useGlobalProps,
	useGlobalPropsChanged,
	useInitData,
	useInitDataChanged,
	useLynxGlobalEventListener,
	type Lynx,
} from '@octanejs/lynx/platform';

declare module '@octanejs/lynx/platform' {
	interface InitDataRaw {
		accountId: string;
	}

	interface InitData {
		accountId: string;
		unread: number;
	}

	interface GlobalProps {
		locale: string;
	}

	interface NativeModules {
		AccountModule: {
			load(accountId: string): Promise<{ displayName: string }>;
		};
	}
}

function PlatformConsumer(): void {
	const initData = useInitData();
	const accountId: string = initData.accountId;
	const unread: number = initData.unread;
	const globalProps = useGlobalProps();
	const locale: string = globalProps.locale;

	useInitDataChanged((next) => {
		const nextAccountId: string = next.accountId;
		void nextAccountId;
	});
	useGlobalPropsChanged((next) => {
		const nextLocale: string = next.locale;
		void nextLocale;
	});
	useLynxGlobalEventListener<[accountId: string, unread: number]>(
		'account-changed',
		(nextAccountId, nextUnread) => {
			const typedAccountId: string = nextAccountId;
			const typedUnread: number = nextUnread;
			void typedAccountId;
			void typedUnread;
		},
	);

	void accountId;
	void unread;
	void locale;
}

const lynxRuntime: Lynx = getLynx();
const presetAccountId: string = lynxRuntime.__presetData.accountId;
const currentAccountId: string | undefined = lynxRuntime.__initData?.accountId;
const runtimeLocale: string = lynxRuntime.__globalProps.locale;
const nativeModules = getNativeModules();
const account = nativeModules.AccountModule.load('account-a');
reload({ accountId: 'account-a' });
reportError(new Error('typed report'), { level: 'warning' });

// @ts-expect-error Reload data is an object matching the augmentable raw-data contract.
reload('account-a');

// @ts-expect-error Only registered Native Modules are available without an index-any escape hatch.
nativeModules.UnregisteredModule.call();

void PlatformConsumer;
void lynxRuntime;
void presetAccountId;
void currentAccountId;
void runtimeLocale;
void account;
