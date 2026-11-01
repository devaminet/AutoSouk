import { generateInspectionReportPdf, InspectionReportData } from "../pdf";

const reportData: InspectionReportData = {
  reference: "AS-2026-000042",
  inspectedAt: new Date("2026-10-30T10:15:00Z"),
  issuedAt: new Date("2026-11-01T09:00:00Z"),
  vehicle: {
    make: "Dacia",
    model: "Logan",
    year: 2019,
    matricule: "12345-A-6",
    vin: "VF1RFB00X12345678",
    carteGriseNumber: null,
    mileageKm: 128500,
    mileageConsistency: "suspicious",
    mileageConsistencyNote: null,
    firstRegistrationDate: "2019-03-14",
    fuel: "diesel",
    transmission: "manual",
    fiscalPower: 6,
    doorsNumber: 5,
    ownersCount: 2,
    origin: "ww",
    city: { slug: "casablanca", name: "Casablanca" },
  },
  administrative: {
    controleTechniqueValid: true,
    controleTechniqueExpiry: null,
    vignetteValid: false,
  },
  expert: {
    name: "Garage Atlas",
    address: "12 Bd Zerktouni",
    city: null,
    phone: null,
  },
  client: { name: "Amina Alaoui" },
  verdict: "fair",
  overallScore: 64,
  summary: "تآكل في الفرامل الأمامية (ABS يعمل).",
  sections: [
    {
      category: "mechanical",
      items: [
        { label: "Plaquettes avant", status: "fail", note: "Usure 80 %" },
        { label: "الزجاج الأمامي", status: "attention" },
      ],
    },
  ],
  estimatedRepairCost: 2500,
};

const arabicFont = "IBMPlexSansArabic";

describe("generateInspectionReportPdf", () => {
  it.each(["fr", "en"] as const)(
    "renders a %s report with the standard fonts",
    async (locale) => {
      const pdf = await generateInspectionReportPdf(reportData, locale);

      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(pdf.toString("latin1")).not.toContain(arabicFont);
    },
  );

  it("renders an Arabic report with an embedded Arabic font", async () => {
    const pdf = await generateInspectionReportPdf(reportData, "ar");

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1")).toContain(arabicFont);
  });
});
