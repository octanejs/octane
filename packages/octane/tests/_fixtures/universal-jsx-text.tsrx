// Keep these scenes identical to universal-jsx-text.object.tsrx: the test
// compares the text each compiler renders for the same authored JSX.
// The authored whitespace is the input, so every scene is prettier-ignored.

export function TrailingSpaceBeforeElement() @{
	// prettier-ignore
	<p>Before <span>middle</span> after</p>
}

export function SpaceBetweenElements() @{
	// prettier-ignore
	<p><span>a</span> <span>b</span></p>
}

export function MultilineText() @{
	// prettier-ignore
	<p>
		First line
		second line <span>inline</span>
		last line
	</p>
}

export function TabsInText() @{
	// prettier-ignore
	<p>Tab	separated	<span>x</span>	end</p>
}
