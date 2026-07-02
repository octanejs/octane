import { Dialog } from '@octanejs/radix';

// Modal dialog exercising the full chain: Portal (array children → faithful per-child
// Presence+Portal), Overlay (scroll lock + dismissable surface), Content (FocusScope trap
// + DismissableLayer + hideOthers), Title/Description ids, Close.
export function DialogApp() {
	return (
		<div data-testid="app">
			<Dialog.Root>
				<Dialog.Trigger data-testid="trigger">open</Dialog.Trigger>
				<Dialog.Portal
					children={[
						<Dialog.Overlay key="o" data-testid="overlay" />,
						<Dialog.Content key="c" data-testid="content">
							<Dialog.Title data-testid="title">Greetings</Dialog.Title>
							<Dialog.Description data-testid="desc">A dialog.</Dialog.Description>
							<button data-testid="inner">inner</button>
							<Dialog.Close data-testid="close">close</Dialog.Close>
						</Dialog.Content>,
					]}
				/>
			</Dialog.Root>
			<button data-testid="outside">outside</button>
		</div>
	);
}
