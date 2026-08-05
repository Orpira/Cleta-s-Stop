import { InputHTMLAttributes, forwardRef } from 'react';

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => {
    const classes = ['input', className].filter(Boolean).join(' ');
    return <input ref={ref} className={classes} {...rest} />;
  }
);
Input.displayName = 'Input';

export { Input };
