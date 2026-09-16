/**
 * Moderation decision copy, shared by the review dialog (inline decision footer) and the queue.
 * The former confirmation modals were replaced by the inline footer (UX-PLAN §12.D.3).
 */

export const REJECT_REASON_MAX = 500;

/** Contract §7.14 copy, shared by the review dialog and the bulk validation. */
export const WILL_NOT_AIR_TITLE = "Validée, cette campagne ne sera pas diffusée";
export const WILL_NOT_AIR_TEXT =
  "L'analyse IA n'a pas rendu d'avis favorable (revue manuelle). En l'état du service, une campagne validée sans avis IA favorable passe au statut « active » et ses créneaux sont confirmés, mais les lecteurs d'écran ne la sélectionnent jamais. Si le contenu doit être corrigé, refusez-la ; sinon, validez en connaissance de cause.";
export const WILL_NOT_AIR_ACK = "J'ai compris : cette campagne ne passera pas sur les écrans.";

export const DECISION_FINAL_TEXT =
  "Décision définitive : il n'existe pas de retour en arrière depuis le back-office.";

export const REJECT_REASON_HINT = `Enregistré dans l'historique de modération. Il n'est pas transmis automatiquement à l'annonceur : copiez le message après le refus. ${REJECT_REASON_MAX} caractères maximum.`;
