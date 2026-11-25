// Keep these scenes identical to universal-jsx-text.tsrx: the test compares
// the text each compiler renders for the same authored JSX.
// The authored whitespace is the input, so every scene is prettier-ignored.

export function TrailingSpaceBeforeElement() @{
	// prettier-ignore
	<view>Before <item>middle</item> after</view>
}

export function MultilineText() @{
	// prettier-ignore
	<view>
		First line
		second line <item>inline</item>
		last line
	</view>
}

export function TabsInText() @{
	// prettier-ignore
	<view>Tab	separated	<item>x</item>	end</view>
}
