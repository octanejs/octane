declare const __webpack_nonce__: string | undefined;

let nonce: string | undefined;

export const getNonce = (): string | undefined => {
	if (nonce) return nonce;
	if (typeof __webpack_nonce__ !== 'undefined') return __webpack_nonce__;
	return undefined;
};

export const setNonce = (hash: string): void => {
	nonce = hash;
};
