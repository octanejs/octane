// Every directive branch body is a scope of its own; its CSS ships regardless.
export function ControlFlow({
	ready,
	items,
	kind,
}: {
	ready: boolean;
	items: string[];
	kind: number;
}) @{
	<>
		<style>
			.root {
				--label: root;
			}
		</style>
		<div class="e0 root">{'root'}</div>
		@if (ready) {
			<style>
				.yes {
					--label: yes;
				}
			</style>
			<p class="e1 yes">{'yes'}</p>
		} @else {
			<style>
				.no {
					--label: no;
				}
			</style>
			<p class="e2 no">{'no'}</p>
		}
		@for (const item of items) {
			<style>
				.item {
					--label: item;
				}
			</style>
			<li class="e3 item">{item}</li>
		} @empty {
			<style>
				.empty {
					--label: empty;
				}
			</style>
			<li class="e4 empty">{'none'}</li>
		}
		@switch (kind) {
			@case 1: {
				<style>
					.one {
						--label: one;
					}
				</style>
				<b class="e5 one">{'one'}</b>
			}
			@case 2: {
				<b class="e6">{'two'}</b>
			}
			@default: {
				<style>
					.other {
						--label: other;
					}
				</style>
				<i class="e7 other">{'other'}</i>
			}
		}
		@try {
			<style>
				.ok {
					--label: ok;
				}
			</style>
			<em class="e8 ok">{'ok'}</em>
		} @catch (error) {
			<style>
				.err {
					--label: err;
				}
			</style>
			<s class="e9 err">{'err'}</s>
		}
	</>
}
