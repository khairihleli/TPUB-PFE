"use client";

import { forwardRef } from "react";

import { type CodeMode, sanitizeTotpInput } from "@/components/account/two-factor-model";
import { Input, type InputProps } from "@/components/ui/field";

export interface CodeInputProps extends Omit<InputProps, "value" | "onChange" | "type"> {
  mode: CodeMode;
  value: string;
  onValueChange: (value: string) => void;
}

/**
 * Verification code control, to place inside a `<Field>`: 6 digits (`inputMode="numeric"`,
 * `autocomplete="one-time-code"`) or a recovery code `xxxxx-xxxxx`.
 */
export const CodeInput = forwardRef<HTMLInputElement, CodeInputProps>(function CodeInput(
  { mode, value, onValueChange, className, ...props },
  ref,
) {
  const totp = mode === "totp";
  return (
    <Input
      ref={ref}
      name={totp ? "code" : "recoveryCode"}
      type="text"
      inputMode={totp ? "numeric" : "text"}
      autoComplete={totp ? "one-time-code" : "off"}
      autoCapitalize="none"
      spellCheck={false}
      maxLength={totp ? 6 : 13}
      placeholder={totp ? "123456" : "xxxxx-xxxxx"}
      pattern={totp ? "[0-9]{6}" : undefined}
      value={value}
      onChange={(e) => onValueChange(totp ? sanitizeTotpInput(e.target.value) : e.target.value)}
      className={["font-mono tracking-[0.3em] tabular", className].filter(Boolean).join(" ")}
      {...props}
    />
  );
});
