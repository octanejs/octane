import { useAccountModal, useChainModal, useConnectModal } from '@octanejs/rainbowkit';

export function OutsideProviderHooks() {
	const connect = useConnectModal();
	const account = useAccountModal();
	const chain = useChainModal();
	return <output id="modal-hooks">{[
		connect.openConnectModal,
		account.openAccountModal,
		chain.openChainModal,
	].map((value) => String(value === undefined)).join(',')}</output>;
}
