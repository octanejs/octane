// A dynamic tag that resolves to a host string at runtime. This module builds
// no element descriptor, so the tag's call site alone must make host rendering
// available.
export function DynamicTag(props: { tag: 'section' | 'aside'; label: string }) @{
	const Tag = props.tag;
	<div>
		<Tag class="dynamic">{props.label}</Tag>
	</div>
}
