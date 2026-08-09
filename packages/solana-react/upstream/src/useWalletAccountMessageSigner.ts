import {
    Address,
    address,
    bytesEqual,
    MessageModifyingSigner,
    SignableMessage,
    SignatureBytes,
    SOLANA_ERROR__SIGNER__WALLET_MULTISIGN_UNIMPLEMENTED,
    SolanaError,
} from '@solana/kit';
import { getAbortablePromise } from '@solana/promises';
import type { UiWalletAccount } from '@wallet-standard/ui';
import { useMemo } from 'react';

import { useSignMessage } from './useSignMessage';

/**
 * Use this to get a {@link MessageSigner} capable of signing messages with the private key of a
 * {@link UiWalletAccount}
 *
 * @returns A {@link MessageModifyingSigner}. This is a conservative assumption based on the fact
 * that your application can not control whether or not the wallet will modify the message before
 * signing it. Otherwise this method could more specifically return a {@link MessageSigner} or a
 * {@link MessagePartialSigner}.
 *
 * @example
 * ```tsx
 * import { useWalletAccountMessageSigner } from '@solana/react';
 * import { createSignableMessage } from '@solana/kit';
 *
 * function SignMessageButton({ account, text }) {
 *     const messageSigner = useWalletAccountMessageSigner(account);
 *     return (
 *         <button
 *             onClick={async () => {
 *                 try {
 *                     const signableMessage = createSignableMessage(text);
 *                     const [signedMessage] = await messageSigner.modifyAndSignMessages([signableMessage]);
 *                     const messageWasModified = signableMessage.content !== signedMessage.content;
 *                     const signatureBytes = signedMessage.signatures[messageSigner.address];
 *                     window.alert(
 *                         `Signature bytes: ${signatureBytes.toString()}${
 *                             messageWasModified ? ' (message was modified)' : ''
 *                         }`,
 *                     );
 *                 } catch (e) {
 *                     console.error('Failed to sign message', e);
 *                 }
 *             }}
 *         >
 *             Sign Message: {text}
 *         </button>
 *     );
 * }
 * ```
 */
export function useWalletAccountMessageSigner<TWalletAccount extends UiWalletAccount>(
    uiWalletAccount: TWalletAccount,
): MessageModifyingSigner<TWalletAccount['address']> {
    const signMessage = useSignMessage(uiWalletAccount);
    return useMemo(
        () => ({
            address: address(uiWalletAccount.address),
            async modifyAndSignMessages(messages, config) {
                config?.abortSignal?.throwIfAborted();
                if (messages.length > 1) {
                    throw new SolanaError(SOLANA_ERROR__SIGNER__WALLET_MULTISIGN_UNIMPLEMENTED);
                }
                if (messages.length === 0) {
                    return messages;
                }
                const { content: originalMessage, signatures: originalSignatureMap } = messages[0];
                const input = {
                    message: originalMessage,
                };
                const { signedMessage, signature } = await getAbortablePromise(signMessage(input), config?.abortSignal);
                const messageWasModified =
                    originalMessage.length !== signedMessage.length ||
                    originalMessage.some((originalByte, ii) => originalByte !== signedMessage[ii]);
                const originalSignature = originalSignatureMap[uiWalletAccount.address as Address<string>] as
                    | SignatureBytes
                    | undefined;
                const signatureIsNew = originalSignature === undefined || !bytesEqual(originalSignature, signature);
                if (!signatureIsNew && !messageWasModified) {
                    // We already had this exact signature, and the message wasn't modified.
                    // Don't replace the existing message object.
                    return messages;
                }
                const nextSignatureMap = messageWasModified
                    ? { [uiWalletAccount.address]: signature }
                    : { ...originalSignatureMap, [uiWalletAccount.address]: signature };
                const outputMessages = Object.freeze([
                    Object.freeze({
                        content: signedMessage,
                        signatures: Object.freeze(nextSignatureMap),
                    }) as SignableMessage,
                ]);
                return outputMessages;
            },
        }),
        [uiWalletAccount, signMessage],
    );
}
