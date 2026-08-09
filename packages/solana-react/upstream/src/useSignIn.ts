import { Address } from '@solana/kit';
import {
    SolanaSignIn,
    SolanaSignInFeature,
    SolanaSignInInput,
    SolanaSignInOutput,
} from '@solana/wallet-standard-features';
import {
    getWalletAccountFeature,
    getWalletFeature,
    UiWallet,
    UiWalletAccount,
    UiWalletHandle,
} from '@wallet-standard/ui';
import {
    getOrCreateUiWalletAccountForStandardWalletAccount_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
    getWalletAccountForUiWalletAccount_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
    getWalletForHandle_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
} from '@wallet-standard/ui-registry';
import { useCallback } from 'react';

type Input = SolanaSignInInput;
type Output = Omit<SolanaSignInOutput, 'account' | 'signatureType'> &
    Readonly<{
        account: UiWalletAccount;
    }>;

/**
 * Use the ['Sign In With Solana'](https://phantom.app/learn/developers/sign-in-with-solana) feature
 * of a {@link UiWallet} or {@link UiWalletAccount}.
 *
 * @returns A function that you can call to sign in with the particular wallet and address specified
 * by the supplied {@link UiWalletAccount}
 *
 * @example
 * ```tsx
 * import { useSignIn } from '@solana/react';
 *
 * function SignInButton({ wallet }) {
 *     const csrfToken = useCsrfToken();
 *     const signIn = useSignIn(wallet);
 *     return (
 *         <button
 *             onClick={async () => {
 *                 try {
 *                     const { account, signedMessage, signature } = await signIn({
 *                         requestId: csrfToken,
 *                     });
 *                     // Authenticate the user, typically on the server, by verifying that
 *                     // `signedMessage` was signed by the person who holds the private key for
 *                     // `account.publicKey`.
 *                     //
 *                     // Authorize the user, also on the server, by decoding `signedMessage` as the
 *                     // text of a Sign In With Solana message, verifying that it was not modified
 *                     // from the values your application expects, and that its content is sufficient
 *                     // to grant them access.
 *                     window.alert(`You are now signed in with the address ${account.address}`);
 *                 } catch (e) {
 *                     console.error('Failed to sign in', e);
 *                 }
 *             }}
 *         >
 *             Sign In
 *         </button>
 *     );
 * }
 * ```
 */
export function useSignIn(uiWalletAccount: UiWalletAccount): (input?: Omit<Input, 'address'>) => Promise<Output>;
/**
 * @returns A function that you can call to sign in with the supplied {@link UiWallet}
 */
export function useSignIn(uiWallet: UiWallet): (input?: Input) => Promise<Output>;
export function useSignIn(uiWalletHandle: UiWalletHandle): (input?: Input) => Promise<Output> {
    const signIns = useSignIns(uiWalletHandle);
    return useCallback(
        async input => {
            const [result] = await signIns(input);
            return result;
        },
        [signIns],
    );
}

function useSignIns(
    uiWalletHandle: UiWalletHandle,
): (...inputs: readonly (Input | undefined)[]) => Promise<readonly Output[]> {
    let signMessageFeature: SolanaSignInFeature[typeof SolanaSignIn];
    if ('address' in uiWalletHandle && typeof uiWalletHandle.address === 'string') {
        getWalletAccountForUiWalletAccount_DO_NOT_USE_OR_YOU_WILL_BE_FIRED(uiWalletHandle as UiWalletAccount);
        signMessageFeature = getWalletAccountFeature(
            uiWalletHandle as UiWalletAccount,
            SolanaSignIn,
        ) as SolanaSignInFeature[typeof SolanaSignIn];
    } else {
        signMessageFeature = getWalletFeature(uiWalletHandle, SolanaSignIn) as SolanaSignInFeature[typeof SolanaSignIn];
    }
    const wallet = getWalletForHandle_DO_NOT_USE_OR_YOU_WILL_BE_FIRED(uiWalletHandle);
    return useCallback(
        async (...inputs) => {
            const inputsWithAddressAndChainId = inputs.map(input => ({
                ...input,
                // Prioritize the `UiWalletAccount` address if it exists.
                ...('address' in uiWalletHandle ? { address: uiWalletHandle.address as Address } : null),
            }));
            const results = await signMessageFeature.signIn(...inputsWithAddressAndChainId);
            const resultsWithoutSignatureType = results.map(
                ({
                    account,
                    signatureType: _, // Solana signatures are always of type `ed25519` so drop this property.
                    ...rest
                }) => ({
                    ...rest,
                    account: getOrCreateUiWalletAccountForStandardWalletAccount_DO_NOT_USE_OR_YOU_WILL_BE_FIRED(
                        wallet,
                        account,
                    ),
                }),
            );
            return resultsWithoutSignatureType;
        },
        [signMessageFeature, uiWalletHandle, wallet],
    );
}
