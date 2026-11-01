import { isolate, visualRuns } from "../pdf_text";

// visualRuns returns the pieces of a right-to-left line from left to right;
// Arabic words stay in logical order because fontkit shapes and reverses them.
describe("visualRuns", () => {
  it("puts the first Arabic word on the right", () => {
    expect(visualRuns("تقرير الخبرة")).toEqual(["الخبرة", " ", "تقرير"]);
  });

  it("keeps Latin text and numbers left to right inside Arabic", () => {
    expect(visualRuns("رقم AS-2026 سنة")).toEqual(["سنة", " AS-2026 ", "رقم"]);
  });

  it("mirrors brackets around left-to-right text", () => {
    expect(visualRuns("نظام (ABS)")).toEqual(["(ABS) ", "نظام"]);
  });

  it("keeps isolated codes in order and drops the isolate marks", () => {
    expect(visualRuns(`الترقيم ${isolate("12345-A-6", "ltr")}`)).toEqual([
      "12345-A-6 ",
      "الترقيم",
    ]);
    expect(visualRuns(`الهاتف ${isolate("+212600000000", "ltr")}`)).toEqual([
      "+212600000000 ",
      "الهاتف",
    ]);
  });

  it("lets typed text follow its own direction", () => {
    expect(visualRuns(`العنوان ${isolate("12 Bd Zerktouni", "auto")}`)).toEqual(
      ["12 Bd Zerktouni ", "العنوان"],
    );
  });

  it("drops direction marks, which have no glyph", () => {
    expect(visualRuns("30‏/10‏/2026")).toEqual(["2026/10/30"]);
  });
});
