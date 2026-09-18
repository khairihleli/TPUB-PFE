/** U+00A0, written as an escape so no editor or shell round-trip can turn it into a plain space. */
const NBSP = " ";

/**
 * French typography for display copy: the space before « ? ! : ; » and inside « guillemets »
 * becomes non-breaking, so a line never starts with an orphan punctuation mark
 * (« …plan média / : choisissez… », « Supprimer « / Rentrée… »). Applied at render time only:
 * content sources, URLs and the JSON-LD keep plain spaces.
 */
export function frTypo(text: string): string {
  return text.replace(/ ([?!:;»])/g, `${NBSP}$1`).replace(/« /g, `«${NBSP}`);
}
