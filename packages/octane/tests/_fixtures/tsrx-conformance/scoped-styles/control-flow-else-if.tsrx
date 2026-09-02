// An `@else if` body is a branch body like any other and should be a scope.
export function ElseIf({ a, b }: { a: boolean; b: boolean }) @{
	<>
		<style>
			.root {
				--label: root;
			}
		</style>
		<div class="e0 root">{'root'}</div>
		@if (a) {
			<b class="e1">{'a'}</b>
		} @else if (b) {
			<style>
				.elif {
					--label: elif;
				}
			</style>
			<b class="e2 elif">{'b'}</b>
		} @else {
			<b class="e3">{'neither'}</b>
		}
	</>
}
