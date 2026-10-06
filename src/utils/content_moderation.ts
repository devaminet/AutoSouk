import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from "obscenity";

// Covers English profanity/NSFW terms, including common leetspeak and
// character-substitution evasion (handled by the recommended transformers).
const englishMatcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

// `obscenity`'s dataset is English-only. AutoSouk's users write in French
// and Arabic (script or Arabizi/Moroccan darija transliteration) too, so a
// curated blocklist catches common explicit/NSFW terms in those languages.
// This is a heuristic, not an exhaustive filter: it will miss novel slang
// and creative obfuscation, but it blocks the common cases.
const FRENCH_AND_ARABIC_BLOCKLIST = [
  // French
  "putain",
  "pute",
  "merde",
  "connard",
  "connasse",
  "encule",
  "enculer",
  "salope",
  "nique ta mere",
  "fils de pute",
  "baise ta mere",
  // Arabizi / Moroccan darija transliteration
  "zbi",
  "zebi",
  "nik mok",
  "nik m",
  "khanzir",
  "mok zbi",
  "chouha",
  "9a7ba",
  "9ahba",
  "qahba",
  "zamel",
  // Arabic script
  "زبي",
  "نيك",
  "خنزير",
  "قحبة",
  "كس",
  "شرموطة",
  "عرص",
];

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Lowercase, strip Latin/Arabic diacritics, and collapse 3+ repeated
// characters (e.g. "fuuuuck" -> "fuuck") to resist basic obfuscation.
const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ًͯ-ٰٟ]/g, "")
    .replace(/(.)\1{2,}/g, "$1$1");

const blocklistPattern = new RegExp(
  FRENCH_AND_ARABIC_BLOCKLIST.map(
    (term) => `(?<![\\p{L}\\p{N}])${escapeRegExp(normalize(term))}(?![\\p{L}\\p{N}])`,
  ).join("|"),
  "u",
);

/**
 * Heuristic NSFW/profanity check across English, French, and Arabic
 * (script or Arabizi). Intended for user-submitted free text such as
 * review messages, not a guarantee of full content moderation.
 */
export const containsNsfwContent = (text: string): boolean => {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  if (englishMatcher.hasMatch(trimmed)) {
    return true;
  }

  return blocklistPattern.test(normalize(trimmed));
};
