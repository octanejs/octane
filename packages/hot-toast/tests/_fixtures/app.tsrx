import { type ToastPosition, Toaster } from '@octanejs/hot-toast';

export function App(props: { position?: ToastPosition }) {
	return (
		<main>
			<h1>Notifications</h1>
			<Toaster position={props.position} />
		</main>
	);
}
