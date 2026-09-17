package com.example.tpubpfe.service.realtime;

/** Published after every diffusion_logs insert; listeners run after commit. */
public record DiffusionRecordedEvent(Long diffusionLogId, Long supportId) {
}
