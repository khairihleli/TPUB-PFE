package com.example.zelqanepfe.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

import java.util.Map;

@Getter
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final Map<String, String> errors;

    public ApiException(HttpStatus status, String message) {
        this(status, status == HttpStatus.NOT_FOUND ? "NOT_FOUND" : "BAD_REQUEST", message, null);
    }

    public ApiException(HttpStatus status, String code, String message) {
        this(status, code, message, null);
    }

    public ApiException(HttpStatus status, String code, String message, Map<String, String> errors) {
        super(message);
        this.status = status;
        this.code = code;
        this.errors = errors;
    }
}
