import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './icon';
import styles from './button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface CommonProps {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconPosition?: 'start' | 'end';
  children: ReactNode;
  className?: string;
}

function classes(variant: Variant, size: Size, className?: string) {
  return [styles.button, styles[variant], styles[size], className].filter(Boolean).join(' ');
}

function Content({ icon, iconPosition, children }: Pick<CommonProps, 'icon' | 'iconPosition' | 'children'>) {
  return (
    <>
      {icon && iconPosition !== 'end' ? <Icon name={icon} size={16} /> : null}
      <span>{children}</span>
      {icon && iconPosition === 'end' ? <Icon name={icon} size={16} /> : null}
    </>
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition,
  children,
  className,
  type = 'button',
  ...rest
}: CommonProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>) {
  return (
    <button type={type} className={classes(variant, size, className)} {...rest}>
      <Content icon={icon} iconPosition={iconPosition}>
        {children}
      </Content>
    </button>
  );
}

/** A link styled as a button. Internal links use client-side navigation. */
export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition,
  children,
  className,
}: CommonProps & { href: string }) {
  return (
    <Link href={href} className={classes(variant, size, className)}>
      <Content icon={icon} iconPosition={iconPosition}>
        {children}
      </Content>
    </Link>
  );
}

/** A plain anchor styled as a button, for file downloads that must not use client-side navigation. */
export function ButtonAnchor({
  href,
  variant = 'secondary',
  size = 'sm',
  icon,
  iconPosition,
  children,
  className,
  download,
}: CommonProps & { href: string; download?: boolean }) {
  return (
    <a href={href} className={classes(variant, size, className)} download={download}>
      <Content icon={icon} iconPosition={iconPosition}>
        {children}
      </Content>
    </a>
  );
}
