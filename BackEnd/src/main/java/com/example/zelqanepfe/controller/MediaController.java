package com.example.zelqanepfe.controller;

import com.example.zelqanepfe.dto.MediaFileResponse;
import com.example.zelqanepfe.service.MediaService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/campaigns/{campaignId}/media")
@RequiredArgsConstructor
public class MediaController {

    private final MediaService mediaService;

    @Operation(summary = "Upload an image, banner or video for a draft campaign (multipart)")
    @PreAuthorize("hasRole('ANNONCEUR')")
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<MediaFileResponse> upload(
            @PathVariable Long campaignId,
            @RequestPart(value = "file", required = false) MultipartFile file,
            @RequestParam(required = false) String kind,
            @RequestParam(required = false) Integer durationSeconds
    ) {
        return ResponseEntity.status(HttpStatus.CREATED).body(mediaService.upload(campaignId, file, kind, durationSeconds));
    }

    @Operation(summary = "List the media of a campaign")
    @PreAuthorize("hasAnyRole('ANNONCEUR', 'ADMINISTRATEUR', 'SUPERVISEUR', 'OPERATEUR')")
    @GetMapping
    public ResponseEntity<List<MediaFileResponse>> list(@PathVariable Long campaignId) {
        return ResponseEntity.ok(mediaService.list(campaignId));
    }

    @Operation(summary = "Delete a media of a draft campaign")
    @PreAuthorize("hasRole('ANNONCEUR')")
    @DeleteMapping("/{mediaId}")
    public ResponseEntity<Void> delete(@PathVariable Long campaignId, @PathVariable Long mediaId) {
        mediaService.delete(campaignId, mediaId);
        return ResponseEntity.noContent().build();
    }
}
