import type { BodyProps, ButtonProps, ContainerProps, ImgProps } from '../src/components.tsrx';

const bodyProps: BodyProps = { dir: 'rtl', id: 'message-body' };
const buttonProps: ButtonProps = { href: 'https://example.com', target: '_self' };
const containerProps: ContainerProps = { cellPadding: 0, role: 'presentation' };
const imageProps: ImgProps = { alt: 'Logo', loading: 'lazy', src: '/logo.png' };

// @ts-expect-error Email components reject attributes that their host element does not support.
const invalidBodyProps: BodyProps = { href: 'https://example.com' };

// @ts-expect-error Email components do not accept arbitrary catch-all props.
const inventedProps: ImgProps = { inventedEmailProp: true };

void [bodyProps, buttonProps, containerProps, imageProps, invalidBodyProps, inventedProps];
