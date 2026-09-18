package com.example.zelqanepfe.service.ai;

import com.example.zelqanepfe.config.AiAnalysisProperties;
import com.example.zelqanepfe.dto.AiProvidersResponse;
import com.example.zelqanepfe.model.AiProviderType;
import com.example.zelqanepfe.service.ai.provider.VisionModerationProvider;
import com.example.zelqanepfe.service.ai.provider.VisionProviderRegistry;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Optional;

/** {@code GET /api/ai/providers}: effective engines, never a key (docs/round2-contract.md §2.7). */
@Service
@RequiredArgsConstructor
public class AiProvidersService {

    private final VisionProviderRegistry registry;
    private final OcrServiceResolver ocrResolver;
    private final AiAnalysisProperties properties;

    public AiProvidersResponse providers() {
        Optional<VisionModerationProvider> requested = registry.requested();
        OcrServiceResolver.OcrStatus ocr = ocrResolver.status();
        AiAnalysisProperties.Learning learning = properties.getLearning();
        return AiProvidersResponse.builder()
                .provider(registry.requestedType().name())
                .configured(registry.requestedType() == AiProviderType.LOCAL
                        || requested.map(VisionModerationProvider::isConfigured).orElse(false))
                .model(requested.map(VisionModerationProvider::model).orElse(null))
                .ocr(new AiProvidersResponse.Ocr(ocr.engine().name(), ocr.languages(), ocr.tessdataPresent(), ocr.reason()))
                .video(new AiProvidersResponse.Video(true, false))
                .learning(new AiProvidersResponse.Learning(learning.isEnabled(), learning.isAutoApply(), learning.getCron()))
                .build();
    }
}
