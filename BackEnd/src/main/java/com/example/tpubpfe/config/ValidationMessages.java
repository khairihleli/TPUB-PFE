package com.example.tpubpfe.config;

import jakarta.validation.ConstraintViolation;
import org.springframework.context.MessageSourceResolvable;
import org.springframework.validation.ObjectError;

import java.math.BigDecimal;
import java.util.Map;

/**
 * French messages for Bean Validation constraints (completion contract §2.0 {@code VALIDATION_FAILED}).
 * A constraint declared with an explicit {@code message} keeps that message; default messages are translated from
 * the constraint type and its attributes.
 */
public final class ValidationMessages {

    private ValidationMessages() {
    }

    public static String french(ObjectError error) {
        ConstraintViolation<?> violation = unwrap(error);
        if (violation != null) {
            return french(violation);
        }
        return fromCode(error.getCode(), Map.of(), error.getDefaultMessage());
    }

    public static String french(MessageSourceResolvable error) {
        if (error instanceof ObjectError objectError) {
            return french(objectError);
        }
        String[] codes = error.getCodes();
        String code = codes == null || codes.length == 0 ? null : codes[codes.length - 1];
        return fromCode(code, Map.of(), error.getDefaultMessage());
    }

    public static String french(ConstraintViolation<?> violation) {
        String template = violation.getMessageTemplate();
        if (template != null && !isDefaultTemplate(template)) {
            return violation.getMessage();
        }
        String type = violation.getConstraintDescriptor().getAnnotation().annotationType().getSimpleName();
        return fromCode(type, violation.getConstraintDescriptor().getAttributes(), violation.getMessage());
    }

    static boolean isDefaultTemplate(String template) {
        return template.startsWith("{jakarta.validation.constraints.")
                || template.startsWith("{org.hibernate.validator.constraints.");
    }

    static String fromCode(String code, Map<String, Object> attributes, String fallback) {
        if (code == null) {
            return fallback == null ? "Valeur invalide." : fallback;
        }
        return switch (code) {
            case "NotBlank", "NotNull", "NotEmpty" -> "Champ obligatoire.";
            case "Email" -> "Adresse e-mail invalide.";
            case "Size", "Length" -> sizeMessage(attributes);
            case "Min" -> "Doit être supérieur ou égal à " + format(attributes.get("value")) + ".";
            case "Max" -> "Doit être inférieur ou égal à " + format(attributes.get("value")) + ".";
            case "DecimalMin" -> (Boolean.FALSE.equals(attributes.get("inclusive"))
                    ? "Doit être strictement supérieur à " : "Doit être supérieur ou égal à ")
                    + format(attributes.get("value")) + ".";
            case "DecimalMax" -> (Boolean.FALSE.equals(attributes.get("inclusive"))
                    ? "Doit être strictement inférieur à " : "Doit être inférieur ou égal à ")
                    + format(attributes.get("value")) + ".";
            case "Positive" -> "Doit être strictement positif.";
            case "PositiveOrZero" -> "Doit être positif ou nul.";
            case "Negative" -> "Doit être strictement négatif.";
            case "NegativeOrZero" -> "Doit être négatif ou nul.";
            case "Pattern" -> "Format invalide.";
            case "Past" -> "Doit être une date passée.";
            case "PastOrPresent" -> "Doit être une date passée ou aujourd'hui.";
            case "Future" -> "Doit être une date future.";
            case "FutureOrPresent" -> "Doit être aujourd'hui ou une date future.";
            case "Digits" -> "Nombre de chiffres invalide.";
            case "AssertTrue", "AssertFalse" -> "Valeur invalide.";
            default -> fallback == null || fallback.isBlank() ? "Valeur invalide." : fallback;
        };
    }

    private static String sizeMessage(Map<String, Object> attributes) {
        Object min = attributes.get("min");
        Object max = attributes.get("max");
        int minValue = min instanceof Number n ? n.intValue() : 0;
        int maxValue = max instanceof Number n ? n.intValue() : Integer.MAX_VALUE;
        if (maxValue == Integer.MAX_VALUE) {
            return "Doit contenir au moins " + minValue + " caractères.";
        }
        if (minValue <= 0) {
            return "Doit contenir au plus " + maxValue + " caractères.";
        }
        return "Doit contenir entre " + minValue + " et " + maxValue + " caractères.";
    }

    private static String format(Object value) {
        if (value instanceof String s) {
            try {
                return new BigDecimal(s).stripTrailingZeros().toPlainString();
            } catch (NumberFormatException ex) {
                return s;
            }
        }
        return String.valueOf(value);
    }

    private static ConstraintViolation<?> unwrap(ObjectError error) {
        try {
            if (error.contains(ConstraintViolation.class)) {
                return error.unwrap(ConstraintViolation.class);
            }
        } catch (IllegalArgumentException ex) {
            return null;
        }
        return null;
    }
}
