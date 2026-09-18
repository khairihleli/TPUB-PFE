package com.example.zelqanepfe.validation;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.util.Arrays;

/**
 * The annotated number must be one of {@link #value()}. {@code null} is valid (use {@code @NotNull} to forbid it).
 */
@Documented
@Target({ElementType.FIELD, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = AllowedIntValues.Validator.class)
public @interface AllowedIntValues {

    int[] value();

    String message() default "must be one of the allowed values";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    class Validator implements ConstraintValidator<AllowedIntValues, Number> {

        private int[] allowed;

        @Override
        public void initialize(AllowedIntValues annotation) {
            this.allowed = annotation.value();
        }

        @Override
        public boolean isValid(Number value, ConstraintValidatorContext context) {
            if (value == null) {
                return true;
            }
            long candidate = value.longValue();
            if (value.doubleValue() != candidate) {
                return false;
            }
            return Arrays.stream(allowed).anyMatch(allowedValue -> allowedValue == candidate);
        }
    }
}
