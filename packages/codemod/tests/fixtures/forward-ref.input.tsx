import { forwardRef, memo, type ReactNode } from 'react';

type ButtonProps = { children: ReactNode; variant?: 'primary' | 'ghost' };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ children, variant = 'primary', ...rest }, ref) => (
  <button ref={ref} className={`btn btn-${variant}`} {...rest}>
    {children}
  </button>
));
Button.displayName = 'Button';

export const Input = memo(
  forwardRef(function Input(props: { label: string }, forwarded: React.ForwardedRef<HTMLInputElement>) {
    return (
      <label>
        {props.label}
        <input ref={forwarded} />
      </label>
    );
  }),
);
