// Labelled form controls. Every control is associated with its label, hint and error text.
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import styles from './form.module.css';

interface FieldProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
}

function describedBy(id: string, hint?: ReactNode, error?: string) {
  return [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
}

function FieldFrame({ id, label, hint, error, required, children }: FieldProps & { children: ReactNode }) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required ? (
          <span className={styles.required} aria-hidden="true">
            {' '}
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  id,
  label,
  hint,
  error,
  required,
  ...rest
}: FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>) {
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} required={required}>
      <input
        id={id}
        className={styles.control}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...rest}
      />
    </FieldFrame>
  );
}

export function TextareaField({
  id,
  label,
  hint,
  error,
  required,
  ...rest
}: FieldProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'>) {
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} required={required}>
      <textarea
        id={id}
        className={`${styles.control} ${styles.textarea}`}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...rest}
      />
    </FieldFrame>
  );
}

export function SelectField({
  id,
  label,
  hint,
  error,
  required,
  options,
  ...rest
}: FieldProps & {
  options: ReadonlyArray<{ value: string; label: string }>;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'>) {
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error} required={required}>
      <select
        id={id}
        className={`${styles.control} ${styles.select}`}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldFrame>
  );
}

/** An accessible on/off switch built on a native checkbox. */
export function Toggle({
  id,
  label,
  description,
  ...rest
}: { id: string; label: string; description?: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'>) {
  return (
    <div className={styles.toggleRow}>
      <div>
        <label htmlFor={id} className={styles.toggleLabel}>
          {label}
        </label>
        {description ? (
          <p id={`${id}-desc`} className={styles.hint}>
            {description}
          </p>
        ) : null}
      </div>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className={styles.switch}
        aria-describedby={description ? `${id}-desc` : undefined}
        {...rest}
      />
    </div>
  );
}

/** Lays out form fields in a responsive grid. */
export function FormGrid({ children }: { children: ReactNode }) {
  return <div className={styles.grid}>{children}</div>;
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}
