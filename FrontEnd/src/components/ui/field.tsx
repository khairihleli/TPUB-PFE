"use client";

import { Eye, EyeOff } from "lucide-react";
import {
  createContext,
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useContext,
  useId,
  useState,
} from "react";

import { cx } from "@/lib/cx";

interface FieldContextValue {
  id: string;
  hintId?: string;
  errorId?: string;
  invalid: boolean;
  required: boolean;
  disabled: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

export function useFieldContext(): FieldContextValue | null {
  return useContext(FieldContext);
}

export interface FieldProps {
  label: ReactNode;
  children: ReactNode;
  /** Help text under the label (linked with aria-describedby). */
  hint?: ReactNode;
  /**
   * French error message; sets aria-invalid on the control. Not a live region (FFA-12): on submit,
   * summarise errors with <ErrorSummary> or focus the single invalid field.
   */
  error?: string | null;
  required?: boolean;
  disabled?: boolean;
  /** Custom id for the control (default: generated). */
  id?: string;
  /** Visually hide the label (still accessible). */
  hideLabel?: boolean;
  /** Extra content aligned right of the label (e.g. « Mot de passe oublié ? »). */
  labelAside?: ReactNode;
  className?: string;
}

/**
 * Owns label/hint/error wiring. Put ONE Input/Textarea/Select/PasswordInput inside:
 * <Field label="E-mail" error={errors.email} required><Input type="email" /></Field>
 */
export function Field({
  label,
  children,
  hint,
  error,
  required = false,
  disabled = false,
  id,
  hideLabel = false,
  labelAside,
  className,
}: FieldProps) {
  const autoId = useId();
  const controlId = id ?? `f${autoId.replace(/:/g, "")}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;

  return (
    <FieldContext.Provider
      value={{ id: controlId, hintId, errorId, invalid: Boolean(error), required, disabled }}
    >
      <div className={cx("flex flex-col gap-2", className)}>
        <div className={cx("flex items-baseline justify-between gap-3", hideLabel && "sr-only")}>
          <label
            htmlFor={controlId}
            className="font-label text-[0.8125rem] font-medium tracking-[0.01em] text-ink-soft"
          >
            {label}
            {required ? (
              <span aria-hidden="true" className="ml-0.5 text-brand-orange-text">
                *
              </span>
            ) : null}
          </label>
          {labelAside ? <div className="text-[0.8125rem]">{labelAside}</div> : null}
        </div>
        {hint ? (
          <p id={hintId} className="-mt-1 text-[0.8125rem] leading-snug text-muted">
            {hint}
          </p>
        ) : null}
        {children}
        {error ? (
          <p
            id={errorId}
            className="flex items-start gap-1.5 text-[0.8125rem] leading-snug text-danger"
          >
            <span
              aria-hidden="true"
              className="mt-[0.45em] size-1.5 shrink-0 rounded-full bg-danger"
            />
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

export const controlClasses =
  "w-full min-h-touch rounded-control border border-line-strong bg-overlay-inset px-3.5 py-2.5 text-[0.9375rem] text-ink transition-[border-color,background-color,box-shadow] duration-200 ease-smooth placeholder:text-muted-2 hover:border-muted-2 focus:border-brand-blue-text focus:bg-bg-2 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-blue-text/60 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger/70 aria-[invalid=true]:focus:border-danger";

function useControlProps(props: {
  id?: string;
  required?: boolean;
  disabled?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
}) {
  const ctx = useFieldContext();
  const describedBy =
    [props["aria-describedby"], ctx?.hintId, ctx?.errorId].filter(Boolean).join(" ") || undefined;
  return {
    id: props.id ?? ctx?.id,
    required: props.required ?? ctx?.required ?? undefined,
    disabled: props.disabled ?? ctx?.disabled ?? undefined,
    "aria-describedby": describedBy,
    "aria-invalid": props["aria-invalid"] ?? (ctx?.invalid ? true : undefined),
  };
}

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref,
) {
  const wired = useControlProps(props);
  return <input ref={ref} {...props} {...wired} className={cx(controlClasses, className)} />;
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, rows = 4, ...props },
  ref,
) {
  const wired = useControlProps(props);
  return (
    <textarea
      ref={ref}
      rows={rows}
      {...props}
      {...wired}
      className={cx(controlClasses, "min-h-28 resize-y leading-relaxed", className)}
    />
  );
});

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  /** Optional first disabled option, e.g. « Choisir… ». */
  placeholder?: string;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, children, placeholder, ...props },
  ref,
) {
  const wired = useControlProps(props);
  return (
    <div className="relative">
      <select
        ref={ref}
        {...props}
        {...wired}
        className={cx(controlClasses, "appearance-none pr-10 [&>option]:bg-surface", className)}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted"
      >
        <path
          d="M5 7.5 10 12.5 15 7.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
});

export type PasswordInputProps = Omit<InputProps, "type">;

/** Password input with an accessible show/hide toggle (aria-pressed, keyboard reachable). */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, ...props }, ref) {
    const [visible, setVisible] = useState(false);
    const wired = useControlProps(props);
    return (
      <div className="relative">
        <input
          ref={ref}
          {...props}
          {...wired}
          type={visible ? "text" : "password"}
          className={cx(controlClasses, "pr-12", className)}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          className="absolute top-1/2 right-1 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-[10px] text-muted transition-colors hover:bg-overlay-hover hover:text-ink"
        >
          {visible ? (
            <EyeOff aria-hidden="true" className="size-4.5" />
          ) : (
            <Eye aria-hidden="true" className="size-4.5" />
          )}
        </button>
      </div>
    );
  },
);
