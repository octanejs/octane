import {
	MDXProvider,
	useMDXComponents,
	type MDXComponents,
	type MDXComponentsProp,
	type MDXProviderProps,
	type MDXProps,
} from '@octanejs/mdx';
import {
	MDXProvider as ServerProvider,
	useMDXComponents as useServerComponents,
	type MDXProviderProps as ServerProps,
} from '@octanejs/mdx/server';
import { compileMdxSync, type CompileMdxOptions } from '@octanejs/mdx/compile';
import { octaneMdx } from '@octanejs/mdx/vite';

const mapping: MDXComponents = { h1: 'h2', nested: { em: 'i' } };
const merge: MDXComponentsProp = (inherited) => ({ ...inherited, em: 'i' });
const props: MDXProviderProps = { components: merge, disableParentContext: true, children: 'body' };
const serverProps: ServerProps = props;
const documentProps: MDXProps = { components: mapping, frontmatter: 'kept' };
MDXProvider(props);
ServerProvider(serverProps);
useMDXComponents(mapping);
useServerComponents(null);
void documentProps;

const compileOptions: CompileMdxOptions = {
	remarkPlugins: [],
	rehypePlugins: [],
	mdxOptions: { development: true, baseUrl: 'https://example.com/docs/' },
};
if (compileOptions.mdxOptions) compileOptions.mdxOptions.development = false;
compileMdxSync('# Heading', 'example.mdx', compileOptions);
octaneMdx(compileOptions);

// @ts-expect-error Compiler options retain their upstream types.
compileMdxSync('', 'example.mdx', { mdxOptions: { development: 'yes' } });
// @ts-expect-error Public MDX imports must not introduce a global JSX namespace.
export type NoGlobalJSX = JSX.Element;

// @ts-expect-error Component mappings do not accept numbers.
MDXProvider({ components: { h1: 123 } });
// @ts-expect-error Parent-context control is boolean on both entries.
ServerProvider({ disableParentContext: 'yes' });
// @ts-expect-error The hook result retains its mapping type.
const invalid: number = useServerComponents().h1;
void invalid;
