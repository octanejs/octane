import { ContactShadows, type ContactShadowsProps } from '@octanejs/drei';

const props: ContactShadowsProps = { scale: [4, 6], blur: 2, frames: 10, color: 'black' };
void props;
void ContactShadows;

// @ts-expect-error scale is numeric or a tuple
const invalid: ContactShadowsProps = { scale: 'large' };
void invalid;
