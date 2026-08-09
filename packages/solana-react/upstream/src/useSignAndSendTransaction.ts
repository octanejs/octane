import {
    SolanaSignAndSendTransaction,
    SolanaSignAndSendTransactionFeature,
    SolanaSignAndSendTransactionInput,
    SolanaSignAndSendTransactionOutput,
} from '@solana/wallet-standard-features';
import {
    WALLET_STANDARD_ERROR__FEATURES__WALLET_ACCOUNT_CHAIN_UNSUPPORTED,
    WalletStandardError,
} from '@wallet-standard/errors';
import { getWalletAccountFeature, type UiWalletAccount } from '@wallet-standard/ui';
import { getWalletAccountForUiWalletAccount_DO_NOT_USE_OR_YOU_WILL_BE_FIRED } from '@wallet-standard/ui-registry';
import { useCallback } from 'react';

import { OnlySolanaChains } from './chain';

type Input = Readonly<
    Omit<SolanaSignAndSendTransactionInput, 'account' | 'chain' | 'options'> & {
        options?: Readonly<{
            minContextSlot?: bigint;
        }>;
    }
>;
type Output = SolanaSignAndSendTransactionOutput;

/**
 * Use this to get a function capable of signing a serialized transaction with the private key of a
 * {@link UiWalletAccount} and sending it to the network for processing.
 *
 * @param chain The identifier of the chain the transaction is destined for. Wallets may use this to
 * simulate the transaction for the user.
 *
 * @example
 * ```tsx
 * import { getBase58Decoder } from '@solana/codecs-strings';
 * import { useSignAndSendTransaction } from '@solana/react';
 *
 * function SignAndSendTransactionButton({ account, transactionBytes }) {
 *     const signAndSendTransaction = useSignAndSendTransaction(account, 'solana:devnet');
 *     return (
 *         <button
 *             onClick={async () => {
 *                 try {
 *                     const { signature } = await signAndSendTransaction({
 *                         transaction: transactionBytes,
 *                     });
 *                     const base58TransactionSignature = getBase58Decoder().decode(signature);
 *                     window.alert(
 *                         `View transaction: https://explorer.solana.com/tx/${base58TransactionSignature}?cluster=devnet`,
 *                     );
 *                 } catch (e) {
 *                     console.error('Failed to send transaction', e);
 *                 }
 *             }}
 *         >
 *             Sign and Send Transaction
 *         </button>
 *     );
 * }
 * ```
 */
export function useSignAndSendTransaction<TWalletAccount extends UiWalletAccount>(
    uiWalletAccount: TWalletAccount,
    chain: OnlySolanaChains<TWalletAccount['chains']>,
): (input: Input) => Promise<Output>;
export function useSignAndSendTransaction<TWalletAccount extends UiWalletAccount>(
    uiWalletAccount: TWalletAccount,
    chain: `solana:${string}`,
): (input: Input) => Promise<Output>;
export function useSignAndSendTransaction<TWalletAccount extends UiWalletAccount>(
    uiWalletAccount: TWalletAccount,
    chain: `solana:${string}`,
): (input: Input) => Promise<Output> {
    const signAndSendTransactions = useSignAndSendTransactions(uiWalletAccount, chain);
    return useCallback(
        async input => {
            const [result] = await signAndSendTransactions(input);
            return result;
        },
        [signAndSendTransactions],
    );
}

/**
 * Use this to get a function capable of signing one or more serialized transactions with the private
 * key of a {@link UiWalletAccount} and sending them to the network for processing. This supports
 * wallets that allow batching multiple transactions in a single request.
 *
 * @example
 * ```tsx
 * import { useSignAndSendTransactions } from '@solana/react';
 *
 * function SignAndSendTransactionsButton({ account, transactionBytes1, transactionBytes2 }) {
 *     const signAndSendTransactions = useSignAndSendTransactions(account, 'solana:devnet');
 *     return (
 *         <button
 *             onClick={async () => {
 *                 try {
 *                     const [first, second] = await signAndSendTransactions(
 *                         { transaction: transactionBytes1 },
 *                         { transaction: transactionBytes2 },
 *                     );
 *                     window.alert(
 *                         `Transaction signatures: ${first.signature.toString()}, ${second.signature.toString()}`,
 *                     );
 *                 } catch (e) {
 *                     console.error('Failed to send transactions', e);
 *                 }
 *             }}
 *         >
 *             Sign and Send Transactions
 *         </button>
 *     );
 * }
 * ```
 */
export function useSignAndSendTransactions<TWalletAccount extends UiWalletAccount>(
    uiWalletAccount: TWalletAccount,
    chain: OnlySolanaChains<TWalletAccount['chains']>,
): (...inputs: readonly Input[]) => Promise<readonly Output[]>;
export function useSignAndSendTransactions<TWalletAccount extends UiWalletAccount>(
    uiWalletAccount: TWalletAccount,
    chain: `solana:${string}`,
): (...inputs: readonly Input[]) => Promise<readonly Output[]>;
export function useSignAndSendTransactions<TWalletAccount extends UiWalletAccount>(
    uiWalletAccount: TWalletAccount,
    chain: `solana:${string}`,
): (...inputs: readonly Input[]) => Promise<readonly Output[]> {
    if (!uiWalletAccount.chains.includes(chain)) {
        throw new WalletStandardError(WALLET_STANDARD_ERROR__FEATURES__WALLET_ACCOUNT_CHAIN_UNSUPPORTED, {
            address: uiWalletAccount.address,
            chain,
            featureName: SolanaSignAndSendTransaction,
            supportedChains: [...uiWalletAccount.chains],
            supportedFeatures: [...uiWalletAccount.features],
        });
    }
    const signAndSendTransactionFeature = getWalletAccountFeature(
        uiWalletAccount,
        SolanaSignAndSendTransaction,
    ) as SolanaSignAndSendTransactionFeature[typeof SolanaSignAndSendTransaction];
    const account = getWalletAccountForUiWalletAccount_DO_NOT_USE_OR_YOU_WILL_BE_FIRED(uiWalletAccount);
    return useCallback(
        async (...inputs) => {
            if (inputs.length === 0) {
                return [];
            }
            const inputsWithChainAndAccount = inputs.map(({ options, ...rest }) => {
                const minContextSlot = options?.minContextSlot;
                return {
                    ...rest,
                    account,
                    chain,
                    ...(minContextSlot != null
                        ? {
                              options: {
                                  minContextSlot: Number(minContextSlot),
                              },
                          }
                        : null),
                };
            });
            const results = await signAndSendTransactionFeature.signAndSendTransaction(...inputsWithChainAndAccount);
            return results;
        },
        [account, chain, signAndSendTransactionFeature],
    );
}
