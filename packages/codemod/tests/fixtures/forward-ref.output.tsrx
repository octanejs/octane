import { memo, type ReactNode, type Ref } from 'octane';

type ButtonProps = { children: ReactNode; variant?: 'primary' | 'ghost' };

export const Button = ({ children, variant = 'primary', ref, ...rest }: ButtonProps & { ref?: Ref<HTMLButtonElement> }) => @{
  <button ref={ref} className={`btn btn-${variant}`} {...rest}>
    {children}
  </button>
};
Button.displayName = 'Button';

export const Input = memo(
  function Input({ ref: forwarded, ...props }: { label: string } & { ref?: Ref<HTMLInputElement> }) @{
    <label>
      {props.label as string}
      <input ref={forwarded} />
    </label>
  },
);
