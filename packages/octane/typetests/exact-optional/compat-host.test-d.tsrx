// The T3 Code report: a conditional style at a host site in a compatibility module.
export function Box({ open }: { open: boolean }) @{
	<div style={open ? { height: 10 } : undefined}>{'x' as string}</div>
}
