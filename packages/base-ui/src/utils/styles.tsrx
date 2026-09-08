const DISABLE_SCROLLBAR_CLASS_NAME = 'base-ui-disable-scrollbar';

// Resource hoisting is compile-time in Octane. Keep the style in a template;
// a host descriptor returned from the object method stays in the body.
function DisableScrollbarStyle({ nonce }: { nonce?: string }) @{
	<style nonce={nonce} href={DISABLE_SCROLLBAR_CLASS_NAME} precedence="base-ui:low">
		.base-ui-disable-scrollbar {
			scrollbar-width: none;
		}
		.base-ui-disable-scrollbar::-webkit-scrollbar {
			display: none;
		}
	</style>
}

export const styleDisableScrollbar = {
	className: DISABLE_SCROLLBAR_CLASS_NAME,
	getElement(nonce?: string) {
		return <DisableScrollbarStyle nonce={nonce} />;
	},
};
