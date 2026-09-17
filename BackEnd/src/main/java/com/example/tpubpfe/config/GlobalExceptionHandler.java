package com.example.tpubpfe.config;

import com.example.tpubpfe.exception.ApiErrorBody;
import com.example.tpubpfe.exception.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.MessageSourceResolvable;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.validation.ObjectError;
import org.springframework.web.ErrorResponse;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MissingPathVariableException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Maps every exception to the single API error body (completion contract §2.0). Messages are French and codes are
 * stable.
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    public static final String DATA_INTEGRITY_MESSAGE =
            "Opération impossible : des données liées existent ou une valeur est invalide.";

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> handleApiException(ApiException ex, HttpServletRequest request) {
        return respond(ex.getStatus(), ex.getCode(), ex.getMessage(), request, ex.getErrors());
    }

    @ExceptionHandler(BindException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(BindException ex, HttpServletRequest request) {
        Map<String, String> errors = new LinkedHashMap<>();
        for (FieldError fieldError : ex.getBindingResult().getFieldErrors()) {
            errors.putIfAbsent(fieldError.getField(), ValidationMessages.french(fieldError));
        }
        for (ObjectError globalError : ex.getBindingResult().getGlobalErrors()) {
            errors.putIfAbsent(globalError.getObjectName(), ValidationMessages.french(globalError));
        }
        return respond(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", validationMessage(errors), request, errors);
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    public ResponseEntity<Map<String, Object>> handleMethodValidation(HandlerMethodValidationException ex,
                                                                      HttpServletRequest request) {
        Map<String, String> errors = new LinkedHashMap<>();
        ex.getParameterValidationResults().forEach(result -> {
            String name = result.getMethodParameter().getParameterName();
            for (MessageSourceResolvable error : result.getResolvableErrors()) {
                errors.putIfAbsent(name == null ? "parameter" : name, ValidationMessages.french(error));
            }
        });
        return respond(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", validationMessage(errors), request, errors);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<Map<String, Object>> handleConstraintViolation(ConstraintViolationException ex,
                                                                         HttpServletRequest request) {
        Map<String, String> errors = new LinkedHashMap<>();
        for (ConstraintViolation<?> violation : ex.getConstraintViolations()) {
            String path = violation.getPropertyPath() == null ? "parameter" : violation.getPropertyPath().toString();
            int dot = path.lastIndexOf('.');
            errors.putIfAbsent(dot >= 0 ? path.substring(dot + 1) : path, ValidationMessages.french(violation));
        }
        return respond(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", validationMessage(errors), request, errors);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> handleBadJson(HttpMessageNotReadableException ex,
                                                             HttpServletRequest request) {
        return respond(HttpStatus.BAD_REQUEST, "INVALID_BODY",
                "Corps de requête invalide : vérifiez le JSON, les valeurs d'énumération et les formats "
                        + "(dates AAAA-MM-JJ, heures HH:mm ou HH:mm:ss).", request, null);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> handleTypeMismatch(MethodArgumentTypeMismatchException ex,
                                                                  HttpServletRequest request) {
        String message = "Valeur invalide pour le paramètre « " + ex.getName() + " ».";
        return respond(HttpStatus.BAD_REQUEST, "INVALID_PARAMETER", message, request, Map.of(ex.getName(), message));
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<Map<String, Object>> handleMissingParameter(MissingServletRequestParameterException ex,
                                                                      HttpServletRequest request) {
        String message = "Paramètre obligatoire manquant : « " + ex.getParameterName() + " ».";
        return respond(HttpStatus.BAD_REQUEST, "MISSING_PARAMETER", message, request,
                Map.of(ex.getParameterName(), "Champ obligatoire."));
    }

    @ExceptionHandler(MissingServletRequestPartException.class)
    public ResponseEntity<Map<String, Object>> handleMissingPart(MissingServletRequestPartException ex,
                                                                 HttpServletRequest request) {
        String message = "Fichier ou partie obligatoire manquant : « " + ex.getRequestPartName() + " ».";
        return respond(HttpStatus.BAD_REQUEST, "MISSING_PARAMETER", message, request,
                Map.of(ex.getRequestPartName(), "Champ obligatoire."));
    }

    @ExceptionHandler({MissingRequestHeaderException.class, MissingPathVariableException.class})
    public ResponseEntity<Map<String, Object>> handleMissingOther(Exception ex, HttpServletRequest request) {
        return respond(HttpStatus.BAD_REQUEST, "MISSING_PARAMETER", "Paramètre obligatoire manquant.", request, null);
    }

    /** Unknown route or missing file under /uploads. */
    @ExceptionHandler({NoResourceFoundException.class, NoHandlerFoundException.class})
    public ResponseEntity<Map<String, Object>> handleNoResource(Exception ex, HttpServletRequest request) {
        return respond(HttpStatus.NOT_FOUND, "NOT_FOUND", "Ressource introuvable.", request, null);
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<Map<String, Object>> handleMethodNotAllowed(HttpRequestMethodNotSupportedException ex,
                                                                      HttpServletRequest request) {
        return respond(HttpStatus.METHOD_NOT_ALLOWED, "METHOD_NOT_ALLOWED",
                "Méthode HTTP " + ex.getMethod() + " non autorisée sur cette ressource.", request, null);
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<Map<String, Object>> handleUnsupportedMediaType(HttpMediaTypeNotSupportedException ex,
                                                                          HttpServletRequest request) {
        return respond(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_MEDIA_TYPE",
                "Type de contenu non pris en charge.", request, null);
    }

    @ExceptionHandler(HttpMediaTypeNotAcceptableException.class)
    public ResponseEntity<Map<String, Object>> handleNotAcceptable(HttpMediaTypeNotAcceptableException ex,
                                                                   HttpServletRequest request) {
        return respond(HttpStatus.NOT_ACCEPTABLE, "NOT_ACCEPTABLE", "Format de réponse demandé non disponible.",
                request, null);
    }

    /** Multipart limit exceeded. */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, Object>> handleMaxUpload(MaxUploadSizeExceededException ex,
                                                               HttpServletRequest request) {
        return respond(HttpStatus.PAYLOAD_TOO_LARGE, "PAYLOAD_TOO_LARGE",
                "Fichier trop volumineux (60 Mo maximum par envoi).", request, null);
    }

    @ExceptionHandler(MultipartException.class)
    public ResponseEntity<Map<String, Object>> handleMultipart(MultipartException ex, HttpServletRequest request) {
        return respond(HttpStatus.BAD_REQUEST, "INVALID_BODY",
                "Requête multipart invalide : envoyez le fichier dans un formulaire multipart/form-data.", request, null);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, Object>> handleDataIntegrity(DataIntegrityViolationException ex,
                                                                   HttpServletRequest request) {
        log.warn("Data integrity violation on {}: {}", request.getRequestURI(), ex.getMostSpecificCause().getMessage());
        return respond(HttpStatus.CONFLICT, "DATA_INTEGRITY", DATA_INTEGRITY_MESSAGE, request, null);
    }

    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<Map<String, Object>> handleBadCredentials(BadCredentialsException ex,
                                                                    HttpServletRequest request) {
        return respond(HttpStatus.UNAUTHORIZED, "BAD_CREDENTIALS", "E-mail ou mot de passe incorrect.", request, null);
    }

    @ExceptionHandler(DisabledException.class)
    public ResponseEntity<Map<String, Object>> handleDisabled(DisabledException ex, HttpServletRequest request) {
        return respond(HttpStatus.UNAUTHORIZED, "ACCOUNT_DISABLED", "Ce compte est désactivé. Contactez TPUB.",
                request, null);
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<Map<String, Object>> handleAuthentication(AuthenticationException ex,
                                                                    HttpServletRequest request) {
        return respond(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Authentification requise.", request, null);
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, Object>> handleAccessDenied(AccessDeniedException ex,
                                                                  HttpServletRequest request) {
        return respond(HttpStatus.FORBIDDEN, "ACCESS_DENIED", "Accès refusé : votre rôle ne permet pas cette action.",
                request, null);
    }

    /** Other framework exceptions that already carry an HTTP status. */
    private ResponseEntity<Map<String, Object>> handleErrorResponse(ErrorResponse errorResponse, Exception ex,
                                                                    HttpServletRequest request) {
        HttpStatusCode statusCode = errorResponse.getStatusCode();
        HttpStatus status = HttpStatus.resolve(statusCode.value());
        if (status == null || status.is5xxServerError()) {
            return internalError(ex, request);
        }
        return respond(status, status == HttpStatus.NOT_FOUND ? "NOT_FOUND" : "BAD_REQUEST",
                status == HttpStatus.NOT_FOUND ? "Ressource introuvable." : "Requête invalide.", request, null);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleGeneric(Exception ex, HttpServletRequest request) {
        if (ex instanceof ErrorResponse errorResponse) {
            return handleErrorResponse(errorResponse, ex, request);
        }
        return internalError(ex, request);
    }

    private ResponseEntity<Map<String, Object>> internalError(Exception ex, HttpServletRequest request) {
        log.error("Unexpected error on {} {}", request == null ? "?" : request.getMethod(),
                request == null ? "?" : request.getRequestURI(), ex);
        return respond(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR",
                "Une erreur inattendue est survenue. Réessayez plus tard.", request, null);
    }

    private static String validationMessage(Map<String, String> errors) {
        return errors.size() == 1
                ? "Données invalides : " + errors.values().iterator().next()
                : "Données invalides : corrigez les champs signalés.";
    }

    private static ResponseEntity<Map<String, Object>> respond(HttpStatus status, String code, String message,
                                                               HttpServletRequest request, Map<String, String> errors) {
        return ResponseEntity.status(status).body(ApiErrorBody.of(status, code, message,
                request == null ? null : request.getRequestURI(), errors));
    }
}
