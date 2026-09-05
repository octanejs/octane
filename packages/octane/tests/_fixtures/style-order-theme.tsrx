// A theme module (RFC tsrx-org/RFCs#1): an exported `<style>` block is a
// module value whose sheet injects at the declaration position — on the
// client that is module evaluation, so importers see it before their own
// scopes by ESM evaluation order.
export const theme = <style>
	div {
		color: black;
	}
	.dark {
		color: white;
	}
</style>;
