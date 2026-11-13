import { toE164 } from "../phone";

it("keeps numbers already in E.164", () => {
  expect(toE164("+212612345678")).toBe("+212612345678");
});

it("reads Moroccan numbers written the local way", () => {
  expect(toE164("0612345678")).toBe("+212612345678");
  expect(toE164("06 12 34 56 78")).toBe("+212612345678");
  expect(toE164("06-12-34-56-78")).toBe("+212612345678");
});

it("reads the 00 international prefix", () => {
  expect(toE164("0033612345678")).toBe("+33612345678");
});

it("refuses what isn't a phone number", () => {
  expect(toE164("hello")).toBeNull();
  expect(toE164("+12")).toBeNull();
  expect(toE164("+0612345678")).toBeNull();
});
