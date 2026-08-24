import { UiWallet, UiWalletAccount } from '@wallet-standard/react';
import React, { createContext } from 'react';

export type SelectedWalletAccountState = UiWalletAccount | undefined;

export type SelectedWalletAccountContextValue = readonly [
    selectedWalletAccount: SelectedWalletAccountState,
    setSelectedWalletAccount: React.Dispatch<React.SetStateAction<SelectedWalletAccountState>>,
    filteredWallets: UiWallet[],
];

export const SelectedWalletAccountContext = /*#__PURE__*/ createContext<SelectedWalletAccountContextValue>([
    undefined,
    () => {},
    [],
]);

export function useSelectedWalletAccount() {
    const ctx = React.useContext(SelectedWalletAccountContext);
    return ctx;
}
