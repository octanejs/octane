import { memo } from 'octane';

export const InlineCode = memo(function InlineCode({ className, ...rest }: Record<string, any>) {
	return <span
		class={`border border-gray-500/20 bg-gray-500/10 rounded px-1 py-0.5${
			className ? ` ${className}` : ''
		}`}
		{...rest}
	/>;
});
