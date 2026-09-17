package com.example.tpubpfe.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.aopalliance.intercept.MethodInvocation;
import org.springframework.context.ApplicationContext;
import org.springframework.lang.NonNull;
import org.springframework.security.authorization.method.PreAuthorizeAuthorizationManager;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import java.lang.reflect.AccessibleObject;
import java.lang.reflect.Method;

/**
 * Evaluates the controller's {@code @PreAuthorize} before argument binding and {@code @Valid}, so a caller with
 * the wrong role gets 403 {@code ACCESS_DENIED} instead of learning validation details (400) of an action they may
 * not perform. The method-security interceptor still runs at invocation time.
 */
public class PreAuthorizeHandlerInterceptor implements HandlerInterceptor {

    private final PreAuthorizeAuthorizationManager authorizationManager = new PreAuthorizeAuthorizationManager();

    public PreAuthorizeHandlerInterceptor(ApplicationContext applicationContext) {
        authorizationManager.setApplicationContext(applicationContext);
    }

    @Override
    public boolean preHandle(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
                             @NonNull Object handler) {
        if (handler instanceof HandlerMethod handlerMethod) {
            authorizationManager.verify(SecurityContextHolder.getContext()::getAuthentication,
                    new HandlerMethodInvocation(handlerMethod));
        }
        return true;
    }

    /** Minimal invocation descriptor: expressions used by the controllers do not reference arguments. */
    private record HandlerMethodInvocation(HandlerMethod handlerMethod) implements MethodInvocation {

        @Override
        @NonNull
        public Method getMethod() {
            return handlerMethod.getMethod();
        }

        @Override
        @NonNull
        public Object[] getArguments() {
            return new Object[handlerMethod.getMethod().getParameterCount()];
        }

        @Override
        public Object proceed() {
            throw new UnsupportedOperationException("Authorization check only");
        }

        @Override
        public Object getThis() {
            return handlerMethod.getBean();
        }

        @Override
        @NonNull
        public AccessibleObject getStaticPart() {
            return handlerMethod.getMethod();
        }
    }
}
