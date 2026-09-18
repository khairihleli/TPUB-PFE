package com.example.zelqanepfe.service.notification;

import com.example.zelqanepfe.config.SupervisionProperties;
import com.example.zelqanepfe.dto.NotificationResponse;
import com.example.zelqanepfe.model.AlertSeverity;
import com.example.zelqanepfe.repository.NotificationRepository;
import com.example.zelqanepfe.service.realtime.NotificationPushEvent;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.Clock;
import java.time.Instant;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Optional e-mail delivery of notifications (docs/round2-contract.md §5.1, §5.5). Enabled only when a
 * {@link JavaMailSender} exists (SMTP configured) and {@code zelqane.notifications.mail.from} is set; nothing is ever
 * simulated. A failure logs a WARN and never fails the business transaction.
 */
@Slf4j
@Component
public class NotificationMailer {

    private final ObjectProvider<JavaMailSender> mailSender;
    private final NotificationRepository notificationRepository;
    private final SupervisionProperties.Notifications properties;
    private final Clock clock;
    private final ExecutorService executor = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "zelqane-notification-mail");
        thread.setDaemon(true);
        return thread;
    });

    public NotificationMailer(ObjectProvider<JavaMailSender> mailSender, NotificationRepository notificationRepository,
                              SupervisionProperties.Notifications properties, Clock clock) {
        this.mailSender = mailSender;
        this.notificationRepository = notificationRepository;
        this.properties = properties;
        this.clock = clock;
    }

    public boolean isEnabled() {
        return mailSender.getIfAvailable() != null && !properties.getMail().getFrom().isBlank();
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onNotification(NotificationPushEvent event) {
        if (!isEnabled() || event.recipientEmail() == null || event.recipientEmail().isBlank()) {
            return;
        }
        if (!severeEnough(event.notification().getSeverity())) {
            return;
        }
        executor.execute(() -> send(event));
    }

    boolean severeEnough(String severity) {
        AlertSeverity minimum = parse(properties.getMail().getMinSeverity(), AlertSeverity.CRITIQUE);
        AlertSeverity actual = parse(severity, AlertSeverity.INFO);
        return actual.ordinal() >= minimum.ordinal();
    }

    private static AlertSeverity parse(String value, AlertSeverity fallback) {
        try {
            return AlertSeverity.valueOf(String.valueOf(value).trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException | NullPointerException e) {
            return fallback;
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void send(NotificationPushEvent event) {
        NotificationResponse notification = event.notification();
        JavaMailSender sender = mailSender.getIfAvailable();
        if (sender == null) {
            return;
        }
        try {
            SimpleMailMessage mail = new SimpleMailMessage();
            mail.setFrom(properties.getMail().getFrom());
            mail.setTo(event.recipientEmail());
            mail.setSubject("[ZELQANE] " + notification.getTitle());
            mail.setText(body(notification));
            sender.send(mail);
            notificationRepository.findById(notification.getId()).ifPresent(entity -> {
                entity.setEmailedAt(Instant.now(clock));
                notificationRepository.save(entity);
            });
        } catch (RuntimeException e) {
            log.warn("Envoi de la notification {} par e-mail impossible : {}", notification.getId(), e.getMessage());
        }
    }

    String body(NotificationResponse notification) {
        StringBuilder text = new StringBuilder(notification.getMessage());
        if (notification.getLink() != null && !notification.getLink().isBlank()) {
            String base = properties.getMail().getBaseUrl();
            String url = base.endsWith("/") ? base.substring(0, base.length() - 1) + notification.getLink()
                    : base + notification.getLink();
            text.append("\n\n").append(url);
        }
        text.append("\n\n— ZELQANE");
        return text.toString();
    }

    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
    }
}
