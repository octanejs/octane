/** @jsxImportSource octane */
import { create } from '../../../../zustand/src/index';

const useGreeting = create(() => ({ greeting: 'Hello from a package' }));

export function ManualApp({ name }: { name: string }) {
	const greeting = useGreeting((state) => state.greeting);
	return <main>{`${greeting}, ${name}!`}</main>;
}
