import type { UiWallet, UiWalletAccount } from '@wallet-standard/react';
import {
    getUiWalletAccountStorageKey,
    uiWalletAccountBelongsToUiWallet,
    uiWalletAccountsAreSame,
    useWallets,
} from '@wallet-standard/react';
import React from 'react';

import { SelectedWalletAccountContext, SelectedWalletAccountState } from './selectedWalletAccountContext';

export type SelectedWalletAccountContextProviderProps = {
    filterWallets: (wallet: UiWallet) => boolean;
    stateSync: {
        deleteSelectedWallet: () => void;
        getSelectedWallet: () => string | null;
        storeSelectedWallet: (accountKey: string) => void;
    };
} & { children: React.ReactNode };

/**
 * Returns the saved wallet account when its corresponding wallet, and account is available.
 * @param wallets All wallets available to select in the app
 * @param savedWalletKey The saved wallet account storage key
 * @returns The saved wallet account, or undefined if not found
 */
function findSavedWalletAccount(
    wallets: readonly UiWallet[],
    savedWalletKey: string | null,
): UiWalletAccount | undefined {
    if (!savedWalletKey) {
        return;
    }
    const [savedWalletName, savedWalletAddress] = savedWalletKey.split(':');
    if (!savedWalletName || !savedWalletAddress) {
        return;
    }
    for (const wallet of wallets) {
        if (wallet.name !== savedWalletName) continue;
        for (const account of wallet.accounts) {
            if (account.address === savedWalletAddress) {
                return account;
            }
        }
    }
}

/**
 * Saves the selected wallet account's storage key to a persistant storage. In future
 * sessions it will try to return that same wallet account, or at least one from the same brand of
 * wallet if the wallet from which it came is still in the Wallet Standard registry.
 * @param children The child components that will have access to the selected wallet account context
 * @param filterWallets A function to filter which wallets are available in the app
 * @param stateSync An object with methods to synchronize the selected wallet account state with persistent storage
 * @returns A React component that provides the selected wallet account context to its children
 */
export function SelectedWalletAccountContextProvider({
    children,
    filterWallets,
    stateSync,
}: SelectedWalletAccountContextProviderProps) {
    const wallets = useWallets();
    const filteredWallets = React.useMemo(() => wallets.filter(filterWallets), [wallets, filterWallets]);
    const wasSetterInvokedRef = React.useRef(false);

    const [selectedWalletAccount, setSelectedWalletAccountInternal] = React.useState<SelectedWalletAccountState>(() => {
        const savedWalletKey = stateSync.getSelectedWallet();
        const savedWalletAccount = findSavedWalletAccount(filteredWallets, savedWalletKey);
        return savedWalletAccount;
    });

    // Public setter: mark the per-instance ref synchronously to avoid races, then schedule state update.
    // useCallback stabilises the setter for consumers.
    const setSelectedWalletAccount: React.Dispatch<React.SetStateAction<SelectedWalletAccountState>> =
        React.useCallback(
            setStateAction => {
                wasSetterInvokedRef.current = true;
                setSelectedWalletAccountInternal(prevSelectedWalletAccount => {
                    const nextWalletAccount =
                        typeof setStateAction === 'function'
                            ? setStateAction(prevSelectedWalletAccount)
                            : setStateAction;
                    return nextWalletAccount;
                });
            },
            [setSelectedWalletAccountInternal],
        );

    //Sync to persistant storage when selectedWalletAccount changes
    React.useEffect(() => {
        if (!wasSetterInvokedRef.current) return;

        const accountKey = selectedWalletAccount ? getUiWalletAccountStorageKey(selectedWalletAccount) : undefined;

        if (accountKey) {
            stateSync.storeSelectedWallet(accountKey);
        } else {
            stateSync.deleteSelectedWallet();
        }
    }, [selectedWalletAccount, stateSync]);

    //Auto-restore saved wallet account if it appears later,
    //and if the user hasn't made an explicit choice yet.
    React.useEffect(() => {
        if (wasSetterInvokedRef.current) return;
        const savedWalletKey = stateSync.getSelectedWallet();
        const savedAccount = findSavedWalletAccount(filteredWallets, savedWalletKey);
        if (savedAccount && selectedWalletAccount && uiWalletAccountsAreSame(savedAccount, selectedWalletAccount)) {
            return;
        }
        if (savedAccount) {
            setSelectedWalletAccountInternal(savedAccount);
        }
    }, [filteredWallets, stateSync, selectedWalletAccount]);

    const walletAccount = React.useMemo(() => {
        if (!selectedWalletAccount) return;
        for (const wallet of filteredWallets) {
            for (const account of wallet.accounts) {
                if (uiWalletAccountsAreSame(account, selectedWalletAccount)) {
                    return account;
                }
            }
            if (uiWalletAccountBelongsToUiWallet(selectedWalletAccount, wallet) && wallet.accounts[0]) {
                return wallet.accounts[0];
            }
        }
    }, [selectedWalletAccount, filteredWallets]);

    React.useEffect(() => {
        // If there is a selected wallet account but the wallet to which it belongs has since
        // disconnected, clear the selected wallet. This is an automatic cleanup and should not
        // mark the 'wasSetterInvoked' ref (so we use the internal setter).
        // Cleanup shouldn't be run if user has made a selection or selectedWalletAccount/walletAccount are loading or undefined
        if (!selectedWalletAccount) return; //still loading ...
        if (wasSetterInvokedRef.current) return; //user made a selection
        if (!walletAccount) {
            setSelectedWalletAccountInternal(undefined);
        }
    }, [selectedWalletAccount, walletAccount]);

    return (
        <SelectedWalletAccountContext.Provider value={[walletAccount, setSelectedWalletAccount, filteredWallets]}>
            {children}
        </SelectedWalletAccountContext.Provider>
    );
}
