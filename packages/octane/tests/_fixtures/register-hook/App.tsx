/** @jsxImportSource octane */
import { useGreeting } from './useGreeting';

export function App({ name }: { name: string }) {
	const greeting = useGreeting(name);
	return <main>{greeting}</main>;
}
