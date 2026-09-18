package com.example.zelqanepfe.config;

import java.util.Map;

/** Test bridge to the package-private translation table of {@link ValidationMessages}. */
public final class ValidationMessagesAccess {

    private ValidationMessagesAccess() {
    }

    public static String fromCode(String code, Map<String, Object> attributes) {
        return ValidationMessages.fromCode(code, attributes, null);
    }
}
