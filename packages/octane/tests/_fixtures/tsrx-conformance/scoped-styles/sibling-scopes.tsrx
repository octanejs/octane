// Sibling scopes emit in source order, each after its parent and before the
// next sibling; the outer block sits last in source and still emits first.
export function Siblings() @{
	<>
		@{
			<>
				<style>
					.first {
						--label: first;
					}
				</style>
				<div class="s1 first">{'1'}</div>
			</>
		}
		@{
			<>
				<style>
					.second {
						--label: second;
					}
				</style>
				<div class="s2 second">@{
					<>
						<style>
							.deep {
								--label: deep;
							}
						</style>
						<span class="s2a deep">{'2a'}</span>
					</>
				}</div>
			</>
		}
		@{
			<>
				<style>
					.third {
						--label: third;
					}
				</style>
				<div class="s3 third">{'3'}</div>
			</>
		}
		<style>
			.outer {
				--label: outer;
			}
		</style>
		<div class="s0 outer">{'0'}</div>
	</>
}
