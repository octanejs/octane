'use strong';

import { useEffect } from 'octane';

export function ShadowedRowEffectStrong(props) @{
	const item = 'outer';
	<section>
		@for (const item of props.items; key item.id) {
			useEffect(() => {
				props.log(`run:${item.value}`);
				return () => props.log(`cleanup:${item.value}`);
			});
			<div>{item.value as string}</div>
		} @empty {
			useEffect(() => {
				props.log(`empty:${item}:${props.emptyValue}`);
				return () => props.log(`empty-cleanup:${item}:${props.emptyValue}`);
			});
			<span>{item}</span>
		}
	</section>
}

export function ShadowedNestedRowEffectStrong(props) @{
	const item = 'outer';
	<section>
		@for (const group of props.groups; key group.id) {
			<div>
				@for ({ id, value: item } of group.items; key id) {
					useEffect(() => {
						props.log(`run:${item}`);
						return () => props.log(`cleanup:${item}`);
					});
					<span>{item as string}</span>
				}
			</div>
		}
	</section>
}
