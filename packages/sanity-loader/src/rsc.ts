export * from './createQueryStore/server-only';

export const useEncodeDataAttribute = (): never => {
	throw new Error('The `useEncodeDataAttribute` hook can only be called from a client component.');
};
