import {
    address,
    assertIsTransactionWithinSizeLimit,
    bytesEqual,
    getCompiledTransactionMessageDecoder,
    getTransactionCodec,
    getTransactionLifetimeConstraintFromCompiledTransactionMessage,
    SOLANA_ERROR__SIGNER__WALLET_MULTISIGN_UNIMPLEMENTED,
    SolanaError,
    Transaction,
    TransactionModifyingSigner,
    TransactionWithinSizeLimit,
    TransactionWithLifetime,
} from '@solana/kit';
import { getAbortablePromise } from '@solana/promises';
import { UiWalletAccount } from '@wallet-standard/ui';
import { useMemo, useRef } from 'react';

import { OnlySolanaChains } from './chain';
import { useSignTransaction } from './useSignTransaction';

/**
 * Use this to get a {@link TransactionSigner} capable of signing serialized transactions with the
 * private key of a {@link UiWalletAccount}
 *
 * @returns A {@link TransactionModifyingSigner}. This is a conservative assumption based on the
 * fact that your application can not control whether or not the wallet will modify the transaction
 * before signing it (eg. to add guard instructions, or a priority fee budget). Otherwise this
 * method could more specifically return a {@link TransactionSigner} or a
 * {@link TransactionPartialSigner}.
 *
 * @example
 * ```tsx
 * import { useWalletAccountTransactionSigner } from '@solana/react';
 *
 * function SignTransactionButton({ account, transaction }) {
 *     const transactionSigner = useWalletAccountTransactionSigner(account, 'solana:devnet');
 *     return (
 *         <button
 *             onClick={async () => {
 *                 try {
 *                     const [{ signatures }] = await transactionSigner.modifyAndSignTransactions([transaction]);
 *                     const signatureBytes = signatures[transactionSigner.address];
 *                     window.alert(`Signature bytes: ${signatureBytes.toString()}`);
 *                 } catch (e) {
 *                     console.error('Failed to sign transaction', e);
 *                 }
 *             }}
 *         >
 *             Sign Transaction
 *         </button>
 *     );
 * }
 * ```
 */
export function useWalletAccountTransactionSigner<TWalletAccount extends UiWalletAccount>(
    uiWalletAccount: TWalletAccount,
    chain: OnlySolanaChains<TWalletAccount['chains']>,
): TransactionModifyingSigner<TWalletAccount['address']>;
export function useWalletAccountTransactionSigner<TWalletAccount extends UiWalletAccount>(
    uiWalletAccount: TWalletAccount,
    chain: `solana:${string}`,
): TransactionModifyingSigner<TWalletAccount['address']>;
export function useWalletAccountTransactionSigner<TWalletAccount extends UiWalletAccount>(
    uiWalletAccount: TWalletAccount,
    chain: `solana:${string}`,
): TransactionModifyingSigner<TWalletAccount['address']> {
    const encoderRef = useRef<ReturnType<typeof getTransactionCodec> | null>(null);
    const signTransaction = useSignTransaction(uiWalletAccount, chain);
    return useMemo(
        () => ({
            address: address(uiWalletAccount.address),
            async modifyAndSignTransactions(transactions, config = {}) {
                const { abortSignal, ...options } = config;
                abortSignal?.throwIfAborted();
                const transactionCodec = (encoderRef.current ||= getTransactionCodec());
                if (transactions.length > 1) {
                    throw new SolanaError(SOLANA_ERROR__SIGNER__WALLET_MULTISIGN_UNIMPLEMENTED);
                }
                if (transactions.length === 0) {
                    return transactions as readonly (Transaction &
                        TransactionWithinSizeLimit &
                        TransactionWithLifetime)[];
                }
                const [transaction] = transactions;
                const wireTransactionBytes = transactionCodec.encode(transaction);
                const inputWithOptions = {
                    ...options,
                    transaction: wireTransactionBytes as Uint8Array,
                };
                const { signedTransaction } = await getAbortablePromise(signTransaction(inputWithOptions), abortSignal);
                const decodedSignedTransaction = transactionCodec.decode(
                    signedTransaction,
                ) as (typeof transactions)[number];

                assertIsTransactionWithinSizeLimit(decodedSignedTransaction);

                const existingLifetime =
                    'lifetimeConstraint' in transaction
                        ? (transaction as TransactionWithLifetime).lifetimeConstraint
                        : undefined;

                if (existingLifetime) {
                    if (bytesEqual(decodedSignedTransaction.messageBytes, transaction.messageBytes)) {
                        // If the transaction has identical bytes, the lifetime won't have changed
                        return Object.freeze([
                            {
                                ...decodedSignedTransaction,
                                lifetimeConstraint: existingLifetime,
                            },
                        ]);
                    }

                    // If the transaction has changed, check the lifetime constraint field
                    const compiledTransactionMessage = getCompiledTransactionMessageDecoder().decode(
                        decodedSignedTransaction.messageBytes,
                    );
                    const currentToken =
                        'blockhash' in existingLifetime ? existingLifetime.blockhash : existingLifetime.nonce;

                    if (compiledTransactionMessage.lifetimeToken === currentToken) {
                        return Object.freeze([
                            {
                                ...decodedSignedTransaction,
                                lifetimeConstraint: existingLifetime,
                            },
                        ]);
                    }
                }

                // If we get here then there is no existing lifetime, or the lifetime has changed. We need to attach a new lifetime
                const compiledTransactionMessage = getCompiledTransactionMessageDecoder().decode(
                    decodedSignedTransaction.messageBytes,
                );
                const lifetimeConstraint =
                    await getTransactionLifetimeConstraintFromCompiledTransactionMessage(compiledTransactionMessage);
                return Object.freeze([
                    {
                        ...decodedSignedTransaction,
                        lifetimeConstraint,
                    },
                ]);
            },
        }),
        [uiWalletAccount.address, signTransaction],
    );
}
