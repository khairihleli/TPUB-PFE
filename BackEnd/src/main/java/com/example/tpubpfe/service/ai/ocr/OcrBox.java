package com.example.tpubpfe.service.ai.ocr;

/** Bounding box of one recognised word, in original image pixels (docs/round2-contract.md §2.2). */
public record OcrBox(int x, int y, int w, int h, float confidence) {

    public long area() {
        return (long) Math.max(0, w) * Math.max(0, h);
    }
}
