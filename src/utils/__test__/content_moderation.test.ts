import { containsNsfwContent } from "../content_moderation";

it("should return false for clean English text", () => {
  expect(containsNsfwContent("Great mechanic, very professional work.")).toBe(
    false,
  );
});

it("should return false for clean French text", () => {
  expect(
    containsNsfwContent("Mecanicien tres professionnel, je recommande."),
  ).toBe(false);
});

it("should return false for an empty or blank message", () => {
  expect(containsNsfwContent("")).toBe(false);
  expect(containsNsfwContent("   ")).toBe(false);
});

it("should detect NSFW English content", () => {
  expect(containsNsfwContent("This mechanic is a fucking idiot")).toBe(true);
});

it("should detect obfuscated English content (repeated characters)", () => {
  expect(containsNsfwContent("fuuuuck this garage")).toBe(true);
});

it("should detect NSFW French content", () => {
  expect(containsNsfwContent("putain de connard, travail horrible")).toBe(
    true,
  );
});

it("should detect NSFW Arabic script content", () => {
  expect(containsNsfwContent("قحبة")).toBe(true);
});

it("should detect NSFW Arabizi (transliterated darija) content", () => {
  expect(containsNsfwContent("had mecanicien zbi bzaf")).toBe(true);
});

it("should not false-positive on words that merely contain a blocked substring", () => {
  expect(containsNsfwContent("I love my nike shoes")).toBe(false);
});
