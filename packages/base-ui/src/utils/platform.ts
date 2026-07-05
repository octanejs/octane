// Minimal port of @base-ui/utils/platform — only the `os.ios` check NumberField needs.
// (jsdom is not iOS, so the iOS input-mode branch is inert in tests.)
function isIOS(): boolean {
	if (typeof navigator === 'undefined') {
		return false;
	}
	return /iP(ad|hone|od)/.test(navigator.platform ?? '');
}
export const platform = {
	os: {
		get ios() {
			return isIOS();
		},
	},
};
