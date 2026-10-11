// Runtime enums conservatively invalidate module-wide component export proofs.
// Keep this escape scenario separate from the shared composition fixture.
function EnumIcon() {
	return <span class="enum-escaped-icon">enum icon</span>;
}

let enumReturnedDescriptor: ReturnType<typeof EnumIcon>;

function captureEnumIcon(descriptor: ReturnType<typeof EnumIcon>): number {
	enumReturnedDescriptor = descriptor;
	return 0;
}

enum CapturedIconValues {
	First = captureEnumIcon(EnumIcon()),
}

export function readEnumReturnedDescriptor() {
	return enumReturnedDescriptor;
}

export function EnumReturnedChild() @{
	<main>
		<EnumIcon />
	</main>
}
