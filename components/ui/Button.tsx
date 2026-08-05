import { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'ghost' | 'stop';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'btn btn-primary',
  ghost: 'btn btn-ghost',
  stop: 'btn btn-stop',
};

export function Button({ variant = 'primary', className, ...rest }: ButtonProps) {
  const classes = [variantClass[variant], className].filter(Boolean).join(' ');
  return <button className={classes} {...rest} />;
}
