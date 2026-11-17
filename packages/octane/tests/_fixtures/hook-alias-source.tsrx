import { createContext, useContext, useState } from 'octane';

export const ReadingContext = createContext('default');

export function useReading() {
	return useContext(ReadingContext);
}

export function useCell(initial: number) {
	return useState(initial);
}
