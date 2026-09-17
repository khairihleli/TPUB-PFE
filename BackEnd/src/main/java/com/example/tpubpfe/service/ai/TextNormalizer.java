package com.example.tpubpfe.service.ai;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Normalisation used by every text rule: lowercase, accents stripped (NFD + removal of combining marks).
 */
public final class TextNormalizer {

    private static final Pattern MARKS = Pattern.compile("\\p{M}+");
    private static final String WORD_CHAR = "[\\p{L}\\p{N}_]";
    private static final Pattern REPEATED_LETTER = Pattern.compile("(\\p{L})\\1{4,}");
    private static final Pattern NON_LETTER = Pattern.compile("[^\\p{L}]+");
    private static final Pattern LATIN_WORD = Pattern.compile("[a-z]+");
    private static final Pattern VOWEL = Pattern.compile("[aeiouy]");

    private TextNormalizer() {
    }

    public static String normalize(String text) {
        if (text == null) {
            return "";
        }
        String decomposed = Normalizer.normalize(text, Normalizer.Form.NFD);
        return MARKS.matcher(decomposed).replaceAll("").toLowerCase(Locale.ROOT);
    }

    /**
     * Whole word / whole phrase matcher for an already normalised phrase. Uses Unicode-aware boundaries so phrases
     * starting or ending with a symbol (e.g. {@code 100%}) still match.
     */
    public static Pattern phrasePattern(String normalizedPhrase) {
        String body = Pattern.quote(normalizedPhrase).replace(" ", "\\E\\s+\\Q");
        return Pattern.compile("(?<!" + WORD_CHAR + ")" + body + "(?!" + WORD_CHAR + ")");
    }

    /** Number of letters and share of uppercase letters in the raw (non-normalised) text. */
    public static double uppercaseRatio(String raw) {
        int letters = letterCount(raw);
        if (letters == 0) {
            return 0d;
        }
        long upper = raw.codePoints().filter(Character::isLetter).filter(Character::isUpperCase).count();
        return (double) upper / letters;
    }

    /**
     * Gibberish or unprofessional text (« incohérent ou non professionnel ») : no letter at all, fewer than 4
     * distinct letters, a letter repeated 5 times in a row, or at least half of the Latin words of 4+ letters
     * without any vowel (keyboard mashing). Non-Latin words (e.g. Arabic) are never judged on vowels.
     */
    public static boolean looksIncoherent(String raw) {
        String text = normalize(raw);
        if (text.isBlank()) {
            return false;
        }
        long distinctLetters = text.codePoints().filter(Character::isLetter).distinct().count();
        if (distinctLetters < 4 || REPEATED_LETTER.matcher(text).find()) {
            return true;
        }
        int latinWords = 0;
        int withoutVowel = 0;
        for (String word : NON_LETTER.split(text)) {
            if (word.length() >= 4 && LATIN_WORD.matcher(word).matches()) {
                latinWords++;
                if (!VOWEL.matcher(word).find()) {
                    withoutVowel++;
                }
            }
        }
        return latinWords >= 2 && withoutVowel * 2 >= latinWords;
    }

    public static int letterCount(String raw) {
        if (raw == null) {
            return 0;
        }
        return (int) raw.codePoints().filter(Character::isLetter).count();
    }
}
