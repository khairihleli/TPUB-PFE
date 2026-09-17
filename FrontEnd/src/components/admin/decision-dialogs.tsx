/**
 * Moderation decision copy, shared by the review dialog (inline decision footer) and the queue.
 * Contract §2.1: REVIEW_REQUIRED needs an explicit, logged override; the refusal reason is
 * returned to the advertiser (« Motif du dernier refus »).
 */
import { REJECT_REASON_MAX, REJECT_REASON_MIN } from "@/components/admin/moderation-model";

export { REJECT_REASON_MAX };

export const OVERRIDE_TITLE = "L'IA demande une revue manuelle";
export const OVERRIDE_TEXT =
  "Valider cette campagne revient à déroger à l'avis de l'IA. La dérogation est enregistrée dans le journal des décisions et l'audit ; la campagne pourra ensuite être diffusée sur sa période.";
export const OVERRIDE_ACK = "Je valide malgré l'avis de l'IA (dérogation journalisée)";

export const DECISION_FINAL_TEXT =
  "Une campagne refusée repasse en brouillon lorsque l'annonceur la corrige, puis revient dans la file après une nouvelle analyse IA.";

export const REJECT_REASON_HINT = `Affiché à l'annonceur dans son espace (« Motif du refus TPUB ») et enregistré dans le journal. ${REJECT_REASON_MIN} à ${REJECT_REASON_MAX} caractères.`;

export const BLOCK_DIFFUSION_TEXT =
  "Bloquer la diffusion annule les réservations de la campagne et la retire immédiatement des écrans.";
