import { twMerge } from 'tailwind-merge';

export function DocContainer({ children, ...props }: { children: any } & Record<string, any>) {
	return <div {...props} class={twMerge('w-full max-w-full', props.className)}>{children}</div>;
}
