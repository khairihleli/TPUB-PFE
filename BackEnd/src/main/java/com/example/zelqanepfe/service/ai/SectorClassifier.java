package com.example.zelqanepfe.service.ai;

import com.example.zelqanepfe.model.AiSector;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * Keyword-based sector detection over normalised campaign text + OCR text. Highest hit count wins
 * (ties: declaration order), no hit → {@link AiSector#AUTRE}.
 */
public class SectorClassifier {

    private static final Map<AiSector, List<String>> KEYWORDS = new EnumMap<>(AiSector.class);

    static {
        KEYWORDS.put(AiSector.RESTAURATION, List.of("restaurant", "cafe", "pizza", "pizzeria", "burger", "menu",
                "cuisine", "patisserie", "snack", "gastronomie", "dejeuner", "diner", "brunch", "traiteur", "plat du jour"));
        KEYWORDS.put(AiSector.EVENEMENT, List.of("evenement", "concert", "festival", "spectacle", "soiree", "conference",
                "exposition", "billetterie", "gala", "salon", "match", "celebration"));
        KEYWORDS.put(AiSector.IMMOBILIER, List.of("immobilier", "appartement", "villa", "terrain", "loyer", "residence",
                "promoteur", "promotion immobiliere", "a vendre", "a louer", "duplex", "studio meuble"));
        KEYWORDS.put(AiSector.SERVICE, List.of("service", "services", "reparation", "nettoyage", "assurance", "banque",
                "agence", "maintenance", "depannage", "plomberie", "conseil", "installation"));
        KEYWORDS.put(AiSector.COMMERCE, List.of("promo", "soldes", "boutique", "magasin", "remise", "reduction", "achat",
                "prix", "collection", "vetements", "supermarche", "offre speciale", "shopping"));
        KEYWORDS.put(AiSector.SANTE, List.of("sante", "clinique", "medecin", "pharmacie", "dentaire", "dentiste", "soins",
                "traitement", "medical", "medicale", "minceur", "regime", "guerison", "therapie", "laboratoire"));
        KEYWORDS.put(AiSector.FORMATION, List.of("formation", "cours", "ecole", "universite", "certificat", "certification",
                "diplome", "atelier", "apprentissage", "inscriptions", "academie", "stage"));
        KEYWORDS.put(AiSector.TRANSPORT, List.of("transport", "taxi", "bus", "voyage", "voyages", "billet d'avion",
                "covoiturage", "location de voiture", "train", "louage", "navette", "demenagement"));
    }

    public record Classification(AiSector sector, int hits) {
    }

    public Classification classify(String normalizedText) {
        if (normalizedText == null || normalizedText.isBlank()) {
            return new Classification(AiSector.AUTRE, 0);
        }
        AiSector best = AiSector.AUTRE;
        int bestHits = 0;
        for (Map.Entry<AiSector, List<String>> entry : KEYWORDS.entrySet()) {
            int hits = 0;
            for (String keyword : entry.getValue()) {
                if (TextNormalizer.phrasePattern(keyword).matcher(normalizedText).find()) {
                    hits++;
                }
            }
            if (hits > bestHits) {
                best = entry.getKey();
                bestHits = hits;
            }
        }
        return new Classification(best, bestHits);
    }
}
