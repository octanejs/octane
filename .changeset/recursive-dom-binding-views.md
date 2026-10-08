---
'octane': minor
---

Support recursive `'use dom bindings'` views. A view can now render itself, or another view in the same module that renders it back, including beneath a keyed `@for`, so a tree's depth comes from its data:

```tsrx
export function Tree({ node }: { node: Branch }) @{
	'use dom bindings';
	<section>
		<span>{node.label as string}</span>
		@for (const child of node.children; key child.key) {
			<Tree node={child} />
		}
	</section>
}
```

Server rendering and the extracted binding artifact both compile, where they previously failed with "recursive binding child programs are not supported". The artifact still loads only the binding runtime, not the renderer. Each level the data reaches is its own instance with its own text, keyed items, native handlers, mount-only effects and `@try` arms. Removing a branch retires the instances beneath it. Recursive calls use the generic program rather than specializing fixed primitive props, so `depth={depth + 1}` does not unroll at compile time.

Recursion that could never end is a compile error. A view that renders itself on every path, for example with a recursive call outside any `@if`, `@for` or `@try`, fails with an error that names the cycle, such as `binding view Tree renders itself on every path (Tree → Tree)`.

A local child view used at several call sites with different prop names now shares one compiled descriptor, unless it spreads a rest parameter.
