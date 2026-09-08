import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { useSelectedWalletAccount } from '../selectedWalletAccountContext';
import { SelectedWalletAccountContextProvider } from '../SelectedWalletAccountContextProvider';

// Mock wallet-standard/react exports the provider depends on
jest.mock('@wallet-standard/react', () => {
    return {
        // The provider itself uses only getUiWalletAccountStorageKey, uiWalletAccountsAreSame, uiWalletAccountBelongsToUiWallet
        getUiWalletAccountStorageKey: jest.fn(),

        uiWalletAccountBelongsToUiWallet: jest.fn(),
        uiWalletAccountsAreSame: jest.fn(),
        useWallets: jest.fn(),
    };
});

import {
    getUiWalletAccountStorageKey,
    UiWallet,
    UiWalletAccount,
    uiWalletAccountBelongsToUiWallet,
    uiWalletAccountsAreSame,
    useWallets,
} from '@wallet-standard/react';

function makeWallet(name: string, accounts: string[]) {
    return {
        accounts: accounts.map(addr => ({ address: addr, walletName: name })),
        name,
    };
}

/** Used to track and error out on infinite re-renders */
let renderCount = 0;
function Consumer() {
    renderCount++;
    if (renderCount > 10) {
        throw new Error('Too many re-renders');
    }
    const [walletAccount, setWalletAccount, filteredWallets] = useSelectedWalletAccount();
    return (
        <div>
            <div data-testid="selected">{walletAccount ? walletAccount.address : 'none'}</div>
            <button
                data-testid="pick-b"
                onClick={() =>
                    setWalletAccount({ address: 'abc', walletName: 'WalletB' } as unknown as UiWalletAccount)
                }
            >
                Pick B
            </button>
            <button data-testid="clear" onClick={() => setWalletAccount(undefined)}>
                Clear
            </button>
            <div data-testid="filtered-wallets">{filteredWallets.map(w => w.name).join(', ')}</div>
        </div>
    );
}

describe('SelectedWalletAccountContextProvider', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        //Mock implementations for wallet-standard/react functions
        (getUiWalletAccountStorageKey as jest.Mock).mockImplementation(
            account => `${account.walletName}:${account.address}`,
        );
        (uiWalletAccountsAreSame as jest.Mock).mockImplementation((a, b) => a?.address === b?.address);
        (uiWalletAccountBelongsToUiWallet as jest.Mock).mockImplementation(
            (account, wallet) => account?.walletName === wallet?.name,
        );

        renderCount = 0;
    });

    test('only filtered wallets are usable', () => {
        const stateSync = {
            deleteSelectedWallet: jest.fn(),
            getSelectedWallet: jest.fn(),
            storeSelectedWallet: jest.fn(),
        };
        const walletA = makeWallet('WalletA', ['123']);
        const walletB = makeWallet('WalletB', ['abc']);

        const mockWallets = [walletA, walletB];
        (useWallets as jest.Mock).mockReturnValue(mockWallets);
        const allowOnlyA = (wallet: UiWallet) => wallet.name === 'WalletA';

        render(
            <SelectedWalletAccountContextProvider filterWallets={allowOnlyA} stateSync={stateSync}>
                <Consumer />
            </SelectedWalletAccountContextProvider>,
        );

        expect(screen.getByTestId('selected').textContent).toBe('none');
        expect(screen.getByTestId('filtered-wallets').textContent).toContain('WalletA');
        expect(screen.getByTestId('filtered-wallets').textContent).not.toContain('WalletB');

        act(() => {
            fireEvent.click(screen.getByTestId('pick-b'));
        });

        /** Even if walletB is selected, since it is not available the provider will return 'undefined' for the walletAccount */
        expect(screen.getByTestId('selected').textContent).toBe('none');
    });

    test('initializes from saved key', () => {
        //saved key matchs a wallet that is available from useWallets
        const stateSync = {
            deleteSelectedWallet: jest.fn(),
            getSelectedWallet: jest.fn().mockReturnValue('WalletA:123'),
            storeSelectedWallet: jest.fn(),
        };

        const walletA = makeWallet('WalletA', ['123', '456']);
        const walletB = makeWallet('WalletB', ['abc']);

        const mockWallets = [walletA, walletB];
        (useWallets as jest.Mock).mockReturnValue(mockWallets);

        const allowWallets = () => true;

        render(
            <SelectedWalletAccountContextProvider filterWallets={allowWallets} stateSync={stateSync}>
                <Consumer />
            </SelectedWalletAccountContextProvider>,
        );

        expect(screen.getByTestId('selected').textContent).toBe('123');
        expect(stateSync.getSelectedWallet).toHaveBeenCalled();
    });

    test('initializes with no selection when saved key is invalid', () => {
        //saved key matchs a wallet that is available from useWallets
        const stateSync = {
            deleteSelectedWallet: jest.fn(),
            getSelectedWallet: jest.fn().mockReturnValue(null),
            storeSelectedWallet: jest.fn(),
        };

        const mockWallets = [makeWallet('WalletA', ['123', '456']), makeWallet('WalletB', ['abc'])];
        (useWallets as jest.Mock).mockReturnValue(mockWallets);

        const allowWallets = () => true;

        render(
            <SelectedWalletAccountContextProvider filterWallets={allowWallets} stateSync={stateSync}>
                <Consumer />
            </SelectedWalletAccountContextProvider>,
        );

        expect(screen.getByTestId('selected').textContent).toBe('none');
        expect(stateSync.getSelectedWallet).toHaveBeenCalled();
    });

    test('initializes with selected wallet when make a selection from the available wallets', () => {
        const stateSync = {
            deleteSelectedWallet: jest.fn(),
            getSelectedWallet: jest.fn().mockReturnValue(null),
            storeSelectedWallet: jest.fn((_accountKey: string) => {}),
        };

        const mockWallets = [makeWallet('WalletA', ['123', '456']), makeWallet('WalletB', ['abc'])];
        (useWallets as jest.Mock).mockReturnValue(mockWallets);

        const allowWallets = () => true;

        render(
            <SelectedWalletAccountContextProvider filterWallets={allowWallets} stateSync={stateSync}>
                <Consumer />
            </SelectedWalletAccountContextProvider>,
        );

        expect(screen.getByTestId('selected').textContent).toBe('none');
        expect(stateSync.getSelectedWallet).toHaveBeenCalled();

        //Make a selection
        act(() => {
            fireEvent.click(screen.getByTestId('pick-b'));
        });

        expect(screen.getByTestId('selected').textContent).toBe('abc');
        expect(stateSync.storeSelectedWallet).toHaveBeenCalledWith('WalletB:abc');
    });

    test('allows changing and clearing selection', async () => {
        const stateSync = {
            deleteSelectedWallet: jest.fn(),
            getSelectedWallet: jest.fn().mockReturnValue(null),
            storeSelectedWallet: jest.fn((_accountKey: string) => {}),
        };

        const mockWallets = [makeWallet('WalletA', ['123', '456']), makeWallet('WalletB', ['abc'])];
        (useWallets as jest.Mock).mockReturnValue(mockWallets);

        const allowWallets = () => true;

        render(
            <SelectedWalletAccountContextProvider filterWallets={allowWallets} stateSync={stateSync}>
                <Consumer />
            </SelectedWalletAccountContextProvider>,
        );

        //Initial state
        expect(screen.getByTestId('selected').textContent).toBe('none');

        //Pick B
        fireEvent.click(screen.getByTestId('pick-b'));

        expect(screen.getByTestId('selected').textContent).toBe('abc');
        await waitFor(() => {
            expect(stateSync.storeSelectedWallet).toHaveBeenCalledWith('WalletB:abc');
        });

        //Clear
        fireEvent.click(screen.getByTestId('clear'));

        expect(screen.getByTestId('selected').textContent).toBe('none');
        await waitFor(() => expect(stateSync.deleteSelectedWallet).toHaveBeenCalled());
    });

    test('auto-restores saved wallet when it appears later', () => {
        const getSelectedWallet = jest.fn().mockReturnValue('WalletA:123');
        const storeSelectedWallet = jest.fn();
        const deleteSelectedWallet = jest.fn();

        const allowWallets = () => true;

        //First render with no wallets
        const mockWallets: UiWallet[] = [];
        const useWalletsMock = useWallets as jest.Mock;
        useWalletsMock.mockReturnValue(mockWallets);

        const { rerender } = render(
            <SelectedWalletAccountContextProvider
                filterWallets={allowWallets}
                stateSync={{
                    deleteSelectedWallet,
                    getSelectedWallet,
                    storeSelectedWallet,
                }}
            >
                <Consumer />
            </SelectedWalletAccountContextProvider>,
        );

        //nothing selected yet
        expect(screen.getByTestId('selected').textContent).toContain('none');
        expect(getSelectedWallet).toHaveBeenCalled();

        //Now update wallets to include the saved one
        const mockWalletsUpdated = [makeWallet('WalletA', ['123']), makeWallet('WalletB', ['abc'])];
        useWalletsMock.mockReturnValue(mockWalletsUpdated);

        act(() => {
            rerender(
                <SelectedWalletAccountContextProvider
                    filterWallets={allowWallets}
                    stateSync={{
                        deleteSelectedWallet,
                        getSelectedWallet,
                        storeSelectedWallet,
                    }}
                >
                    <Consumer />
                </SelectedWalletAccountContextProvider>,
            );
        });

        expect(screen.getByTestId('selected').textContent).toBe('123');
    });

    test('clears in-memory selection when selected wallet disappears', () => {
        const getSelectedWallet = jest.fn().mockReturnValue('WalletA:123');
        const storeSelectedWallet = jest.fn();
        const deleteSelectedWallet = jest.fn();

        //First render with WalletA present
        const mockWallets = [makeWallet('WalletA', ['123', '456']), makeWallet('WalletB', ['abc'])];
        const useWalletsMock = useWallets as jest.Mock;
        useWalletsMock.mockReturnValue(mockWallets);

        const allowWallets = () => true;

        const { rerender } = render(
            <SelectedWalletAccountContextProvider
                filterWallets={allowWallets}
                stateSync={{
                    deleteSelectedWallet,
                    getSelectedWallet,
                    storeSelectedWallet,
                }}
            >
                <Consumer />
            </SelectedWalletAccountContextProvider>,
        );

        //WalletA:123 is selected
        expect(screen.getByTestId('selected').textContent).toBe('123');
        expect(getSelectedWallet).toHaveBeenCalled();

        //Now update wallets to remove WalletA
        const mockWalletsUpdated = [makeWallet('WalletB', ['abc'])];
        useWalletsMock.mockReturnValue(mockWalletsUpdated);

        act(() => {
            rerender(
                <SelectedWalletAccountContextProvider
                    filterWallets={allowWallets}
                    stateSync={{
                        deleteSelectedWallet,
                        getSelectedWallet,
                        storeSelectedWallet,
                    }}
                >
                    <Consumer />
                </SelectedWalletAccountContextProvider>,
            );
        });

        expect(screen.getByTestId('selected').textContent).toBe('none');
    });
});
