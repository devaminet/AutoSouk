import PDFDocument from "pdfkit";
import {
  EnumKind,
  Locale,
  translate,
  translateEnum,
  TranslationKey,
  TranslationParams,
} from "../../i18n";
import { rtlLocales } from "../../utils/constants";
import {
  createPdfText,
  FontWeight,
  isolate,
  PdfText,
  TextBox,
} from "./pdf_text";

type Doc = PDFKit.PDFDocument;

type LookupValue = { slug: string; name: string } | null;

export type InspectionReportData = {
  reference: string;
  inspectedAt: Date;
  issuedAt: Date;
  vehicle: {
    make: string | null;
    model: string | null;
    year: number;
    matricule: string;
    vin: string | null;
    carteGriseNumber: string | null;
    mileageKm: number;
    mileageConsistency: "consistent" | "suspicious" | "unverifiable";
    mileageConsistencyNote: string | null;
    firstRegistrationDate: string | null;
    fuel: string | null;
    transmission: string;
    fiscalPower: number;
    doorsNumber: number;
    ownersCount: number;
    origin: string | null;
    city: LookupValue;
  };
  administrative: {
    controleTechniqueValid: boolean;
    controleTechniqueExpiry: string | null;
    vignetteValid: boolean;
  };
  expert: {
    name: string;
    address: string;
    city: LookupValue;
    phone: string | null;
  };
  client: { name: string };
  verdict: "excellent" | "good" | "fair" | "poor";
  overallScore: number;
  summary: string;
  sections: {
    category: string;
    items: { label: string; status: ItemStatus; note?: string }[];
  }[];
  estimatedRepairCost?: number;
};

type ItemStatus = "pass" | "attention" | "fail";

const COLORS = {
  primary: "#0F4C81",
  primarySoft: "#E8EFF6",
  ink: "#1A1A1A",
  muted: "#5A6672",
  line: "#D9E0E6",
  zebra: "#F6F8FA",
  pass: "#1B7F4B",
  attention: "#B7791F",
  fail: "#C0392B",
  white: "#FFFFFF",
};

const STATUS_COLORS: Record<ItemStatus, string> = {
  pass: COLORS.pass,
  attention: COLORS.attention,
  fail: COLORS.fail,
};

const VERDICT_COLORS: Record<InspectionReportData["verdict"], string> = {
  excellent: COLORS.pass,
  good: COLORS.pass,
  fair: COLORS.attention,
  poor: COLORS.fail,
};

const MILEAGE_STYLES = {
  consistent: { tone: COLORS.pass, background: "#EAF5EF", border: "#A9D5BC" },
  suspicious: { tone: COLORS.fail, background: "#FBEBE9", border: "#E8B4AE" },
  unverifiable: {
    tone: COLORS.attention,
    background: "#FCF3E8",
    border: "#E6C79C",
  },
};

const LEGAL_POINTS = [
  "scope",
  "disassembly",
  "mileage",
  "estimates",
  "liability",
] as const;

// Moroccan Arabic uses Western digits, which ar-MA formats with.
const intlLocales: Record<Locale, string> = {
  en: "en-GB",
  fr: "fr-FR",
  ar: "ar-MA",
};

// Everything the report needs to speak one language.
type Report = {
  doc: Doc;
  w: PdfText;
  locale: Locale;
  t: (key: string, params?: TranslationParams) => string;
  label: (kind: EnumKind, value: string, fallback?: string) => string;
  upper: (value: string) => string;
  /** A value that always reads left to right (plate, VIN, phone). */
  code: (value: string) => string;
  /** Text someone typed, in whatever language they typed it. */
  userText: (value: string) => string;
  formatNumber: (value: number) => string;
  formatDate: (value: Date | string | null | undefined) => string;
  formatDateTime: (value: Date) => string;
};

// PDF standard fonts have no narrow/non-breaking space: Intl emits them as
// thousands separators and they render as stray glyphs.
const sanitize = (value: string) => value.replace(/[   ]/g, " ");

const createReport = (doc: Doc, locale: Locale): Report => {
  const intlLocale = intlLocales[locale];
  const rtl = rtlLocales.includes(locale);
  const dateFormatter = new Intl.DateTimeFormat(intlLocale, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const dateTimeFormatter = new Intl.DateTimeFormat(intlLocale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const numberFormatter = new Intl.NumberFormat(intlLocale);
  const t = (key: string, params?: TranslationParams) =>
    translate(locale, `pdf:${key}` as TranslationKey, params);

  return {
    doc,
    w: createPdfText(doc, rtl),
    locale,
    t,
    label: (kind, value, fallback) =>
      translateEnum(locale, kind, value, fallback),
    upper: (value) => value.toLocaleUpperCase(intlLocale),
    code: (value) => (rtl ? isolate(value, "ltr") : value),
    userText: (value) => (rtl ? isolate(value, "auto") : value),
    formatNumber: (value) => sanitize(numberFormatter.format(value)),
    formatDate: (value) => {
      if (!value) return t("values.not_provided");
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime())
        ? t("values.not_provided")
        : sanitize(dateFormatter.format(date));
    },
    formatDateTime: (value) => sanitize(dateTimeFormatter.format(value)),
  };
};

const style = (weight: FontWeight, size: number, color: string) => ({
  weight,
  size,
  color,
});

const contentWidth = (doc: Doc) =>
  doc.page.width - doc.page.margins.left - doc.page.margins.right;

const bottomLimit = (doc: Doc) => doc.page.height - doc.page.margins.bottom;

const ensureSpace = (doc: Doc, needed: number) => {
  if (doc.y + needed > bottomLimit(doc)) {
    doc.addPage();
  }
};

const notProvided = (report: Report, value: string | null) =>
  value ?? report.t("values.not_provided");

const lookupLabel = (report: Report, kind: EnumKind, value: LookupValue) =>
  value
    ? report.label(kind, value.slug, value.name)
    : report.t("values.not_provided");

// `reserve` keeps the heading on the same page as the block that follows it.
const sectionTitle = (report: Report, title: string, reserve = 46) => {
  const { doc, w } = report;
  ensureSpace(doc, reserve);
  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  const top = doc.y;

  doc.save();
  doc.rect(w.boxX(x, width), top, width, 22).fill(COLORS.primarySoft);
  doc.rect(w.boxX(x, 3), top, 3, 22).fill(COLORS.primary);
  w.text(report.upper(title), style("bold", 10, COLORS.primary), {
    x: x + 12,
    y: top + 7,
    width: width - 20,
    lineBreak: false,
  });
  doc.restore();

  doc.y = top + 22 + 10;
};

const keyValueGrid = (
  report: Report,
  pairs: { label: string; value: string }[],
  columns = 2,
) => {
  const { doc, w } = report;
  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  const columnWidth = width / columns;
  const rowHeight = 30;

  for (let index = 0; index < pairs.length; index += columns) {
    ensureSpace(doc, rowHeight);
    const rowTop = doc.y;

    for (let column = 0; column < columns; column += 1) {
      const pair = pairs[index + column];
      if (!pair) continue;
      const cellX = x + column * columnWidth;

      w.text(report.upper(pair.label), style("regular", 7.5, COLORS.muted), {
        x: cellX,
        y: rowTop,
        width: columnWidth - 12,
        lineBreak: false,
      });
      w.text(pair.value, style("bold", 10, COLORS.ink), {
        x: cellX,
        y: rowTop + 11,
        width: columnWidth - 12,
        lineBreak: false,
        ellipsis: true,
      });
    }

    doc.y = rowTop + rowHeight;
    doc
      .save()
      .strokeColor(COLORS.line)
      .lineWidth(0.5)
      .moveTo(x, doc.y - 8)
      .lineTo(x + width, doc.y - 8)
      .stroke()
      .restore();
  }

  doc.y += 6;
};

const statusChip = (
  report: Report,
  x: number,
  y: number,
  status: ItemStatus,
) => {
  const { doc, w } = report;
  const width = 74;
  const height = 15;

  doc.save();
  doc
    .roundedRect(w.boxX(x, width), y, width, height, 7.5)
    .fill(STATUS_COLORS[status]);
  w.text(
    report.upper(report.label("inspection_item_status", status)),
    style("bold", 7.5, COLORS.white),
    { x, y: y + 4.5, width, align: "center", lineBreak: false },
  );
  doc.restore();
};

const findingsTable = (
  report: Report,
  items: InspectionReportData["sections"][number]["items"],
) => {
  const { doc, w, t } = report;
  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  const columns = [width * 0.42, width * 0.19, width * 0.39];
  const padding = 7;
  const cellStyle = style("regular", 9, COLORS.ink);

  const drawHeader = () => {
    const top = doc.y;
    const headerStyle = style("bold", 8, COLORS.white);
    const headerCell = (offset: number, cellWidth: number): TextBox => ({
      x: x + offset + padding,
      y: top + 6.5,
      width: cellWidth - padding,
      lineBreak: false,
    });
    doc.save();
    doc.rect(w.boxX(x, width), top, width, 20).fill(COLORS.primary);
    w.text(
      report.upper(t("table.item")),
      headerStyle,
      headerCell(0, columns[0]),
    );
    w.text(
      report.upper(t("table.status")),
      headerStyle,
      headerCell(columns[0], columns[1]),
    );
    w.text(
      report.upper(t("table.notes")),
      headerStyle,
      headerCell(columns[0] + columns[1], columns[2]),
    );
    doc.restore();
    doc.y = top + 20;
  };

  ensureSpace(doc, 60);
  drawHeader();

  items.forEach((item, index) => {
    const note = item.note || "—";
    const labelHeight = w.heightOf(
      item.label,
      cellStyle,
      columns[0] - padding * 2,
    );
    const noteHeight = w.heightOf(note, cellStyle, columns[2] - padding * 2);
    const rowHeight = Math.max(labelHeight, noteHeight, 15) + padding * 2;

    if (doc.y + rowHeight > bottomLimit(doc)) {
      doc.addPage();
      drawHeader();
    }

    const top = doc.y;
    if (index % 2 === 1) {
      doc
        .save()
        .rect(w.boxX(x, width), top, width, rowHeight)
        .fill(COLORS.zebra)
        .restore();
    }

    w.text(item.label, cellStyle, {
      x: x + padding,
      y: top + padding,
      width: columns[0] - padding * 2,
    });

    statusChip(report, x + columns[0] + padding, top + padding, item.status);

    w.text(note, style("regular", 9, item.note ? COLORS.ink : COLORS.muted), {
      x: x + columns[0] + columns[1] + padding,
      y: top + padding,
      width: columns[2] - padding * 2,
    });

    doc.y = top + rowHeight;
    doc
      .save()
      .strokeColor(COLORS.line)
      .lineWidth(0.5)
      .moveTo(x, doc.y)
      .lineTo(x + width, doc.y)
      .stroke()
      .restore();
  });

  doc.y += 12;
};

const mileageConsistencyCallout = (
  report: Report,
  data: InspectionReportData,
) => {
  const { doc, w, t } = report;
  const consistency = data.vehicle.mileageConsistency;
  const colors = MILEAGE_STYLES[consistency];
  const body =
    data.vehicle.mileageConsistencyNote || t(`mileage.${consistency}.fallback`);
  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  const bodyStyle = style("regular", 8.5, COLORS.ink);

  const bodyHeight = w.heightOf(body, bodyStyle, width - 28);
  const height = bodyHeight + 30;

  ensureSpace(doc, height + 10);
  const top = doc.y;

  doc.save();
  doc
    .roundedRect(w.boxX(x, width), top, width, height, 4)
    .fillAndStroke(colors.background, colors.border);
  w.text(
    report.upper(t(`mileage.${consistency}.title`)),
    style("bold", 9, colors.tone),
    { x: x + 14, y: top + 10, width: width - 28, lineBreak: false },
  );
  w.text(body, bodyStyle, { x: x + 14, y: top + 23, width: width - 28 });
  doc.restore();

  doc.y = top + height + 10;
};

const verdictPanel = (report: Report, data: InspectionReportData) => {
  const { doc, w, t } = report;
  const color = VERDICT_COLORS[data.verdict];
  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  const height = 92;

  ensureSpace(doc, height + 14);
  const top = doc.y;

  doc.save();
  doc
    .roundedRect(w.boxX(x, width), top, width, height, 4)
    .fillAndStroke(COLORS.zebra, COLORS.line);
  doc.roundedRect(w.boxX(x, 4), top, 4, height, 2).fill(color);

  w.text(
    report.upper(t("verdict.heading")),
    style("regular", 8, COLORS.muted),
    {
      x: x + 16,
      y: top + 14,
      width: width * 0.58,
      lineBreak: false,
    },
  );
  w.text(
    report.label("inspection_verdict", data.verdict),
    style("bold", 17, color),
    { x: x + 16, y: top + 27, width: width * 0.58, lineBreak: false },
  );
  w.text(
    t(`verdict.advice.${data.verdict}`),
    style("regular", 8.5, COLORS.muted),
    {
      x: x + 16,
      y: top + 54,
      width: width * 0.58,
    },
  );

  const gaugeWidth = 150;
  const gaugeX = x + width - gaugeWidth - 16;
  w.text(report.upper(t("verdict.score")), style("regular", 8, COLORS.muted), {
    x: gaugeX,
    y: top + 14,
    width: gaugeWidth,
    align: "end",
    lineBreak: false,
  });

  // The score reads left to right ("84 /100") in every language, so it is
  // laid out inside the (mirrored) gauge box rather than mirrored itself.
  const gaugeLeft = w.boxX(gaugeX, gaugeWidth);
  const scoreBox = (offset: number, boxWidth: number): TextBox => ({
    x: w.rtl ? gaugeX + gaugeWidth - offset - boxWidth : gaugeX + offset,
    y: 0,
    width: boxWidth,
    lineBreak: false,
  });
  w.text(`${data.overallScore}`, style("bold", 20, COLORS.ink), {
    ...scoreBox(0, gaugeWidth - 34),
    y: top + 26,
    align: w.rtl ? "start" : "end",
    ltr: true,
  });
  w.text("/100", style("regular", 11, COLORS.muted), {
    ...scoreBox(gaugeWidth - 30, 30),
    y: top + 34,
    align: w.rtl ? "end" : "start",
    ltr: true,
  });

  const barY = top + 58;
  doc.roundedRect(gaugeLeft, barY, gaugeWidth, 8, 4).fill(COLORS.line);
  const filled = Math.max(4, (gaugeWidth * data.overallScore) / 100);
  doc.roundedRect(w.boxX(gaugeX, filled), barY, filled, 8, 4).fill(color);
  doc.restore();

  doc.y = top + height + 14;
};

const anomaliesSummary = (report: Report, data: InspectionReportData) => {
  const { doc, w, t } = report;
  const anomalies = data.sections.flatMap((section) =>
    section.items
      .filter((item) => item.status !== "pass")
      .map((item) => ({
        category: report.label("inspection_category", section.category),
        ...item,
      })),
  );

  sectionTitle(report, t("sections.anomalies"), 90);

  if (anomalies.length === 0) {
    const height = w.text(
      t("anomalies.none"),
      style("regular", 9.5, COLORS.pass),
      {
        x: doc.page.margins.left,
        y: doc.y,
        width: contentWidth(doc),
      },
    );
    doc.y += height + 14;
    return;
  }

  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  const textStyle = style("regular", 9.5, COLORS.ink);

  anomalies.forEach((anomaly) => {
    const text = `${anomaly.category} — ${anomaly.label}${anomaly.note ? ` : ${anomaly.note}` : ""}`;
    const textHeight = w.heightOf(text, textStyle, width - 96);
    const rowHeight = Math.max(textHeight, 15) + 10;

    ensureSpace(doc, rowHeight);
    const top = doc.y;
    statusChip(report, x, top, anomaly.status);
    w.text(text, textStyle, { x: x + 86, y: top + 1, width: width - 96 });
    doc.y = top + rowHeight;
  });

  doc.y += 6;
};

const repairEstimate = (report: Report, data: InspectionReportData) => {
  if (data.estimatedRepairCost === undefined) return;
  const { doc, w, t } = report;

  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  const height = 52;

  sectionTitle(report, t("sections.repairs"), height + 44);

  ensureSpace(doc, height + 12);
  const top = doc.y;

  doc.save();
  doc
    .roundedRect(w.boxX(x, width), top, width, height, 4)
    .fillAndStroke(COLORS.primarySoft, COLORS.line);
  w.text(report.upper(t("repairs.amount")), style("regular", 8, COLORS.muted), {
    x: x + 16,
    y: top + 14,
    width: width - 32,
    lineBreak: false,
  });
  w.text(
    t("values.mad", { value: report.formatNumber(data.estimatedRepairCost) }),
    style("bold", 18, COLORS.primary),
    { x: x + 16, y: top + 26, width: width - 32, lineBreak: false },
  );
  doc.restore();

  doc.y = top + height + 12;
};

const conclusion = (report: Report, data: InspectionReportData) => {
  const { doc, w, t } = report;
  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  const textStyle = style("regular", 10, COLORS.ink);

  const textHeight = w.heightOf(data.summary, textStyle, width - 28);
  const height = textHeight + 28;

  sectionTitle(report, t("sections.conclusion"), height + 44);

  ensureSpace(doc, height + 12);
  const top = doc.y;

  doc.save();
  doc
    .roundedRect(w.boxX(x, width), top, width, height, 4)
    .fillAndStroke(COLORS.white, COLORS.line);
  w.text(data.summary, textStyle, {
    x: x + 14,
    y: top + 14,
    width: width - 28,
    justify: true,
  });
  doc.restore();

  doc.y = top + height + 12;
};

const legalSection = (report: Report) => {
  const { doc, w, t } = report;
  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  const notice = t("legal.notice");
  const noticeStyle = style("bold", 8.5, "#8A5A12");
  const pointStyle = style("regular", 8.5, COLORS.muted);

  const noticeHeight = w.heightOf(notice, noticeStyle, width - 28);

  sectionTitle(report, t("sections.legal"), noticeHeight + 66);

  ensureSpace(doc, noticeHeight + 24);
  const top = doc.y;
  doc.save();
  doc
    .roundedRect(w.boxX(x, width), top, width, noticeHeight + 20, 4)
    .fillAndStroke("#FCF3E8", "#E6C79C");
  w.text(notice, noticeStyle, {
    x: x + 14,
    y: top + 10,
    width: width - 28,
    justify: true,
  });
  doc.restore();
  doc.y = top + noticeHeight + 30;

  LEGAL_POINTS.forEach((point) => {
    const text = t(`legal.points.${point}`);
    const height = w.heightOf(text, pointStyle, width - 14);
    ensureSpace(doc, height + 6);
    const lineTop = doc.y;
    w.text("•", pointStyle, { x, y: lineTop, width: 10, lineBreak: false });
    w.text(text, pointStyle, {
      x: x + 12,
      y: lineTop,
      width: width - 14,
      justify: true,
    });
    doc.y = lineTop + height + 4;
  });

  doc.y += 6;
};

const signatureBlock = (report: Report, data: InspectionReportData) => {
  const { doc, w, t } = report;
  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  const boxWidth = (width - 20) / 2;
  const height = 96;

  ensureSpace(doc, height + 34);

  w.text(
    t("signature.place_date", {
      city: data.expert.city
        ? lookupLabel(report, "city", data.expert.city)
        : "—",
      date: report.formatDate(data.issuedAt),
    }),
    style("regular", 9, COLORS.ink),
    { x, y: doc.y, width, lineBreak: false },
  );
  doc.y += 18;

  const top = doc.y;
  const boxes = [
    {
      title: t("signature.expert_title"),
      subtitle: `${data.expert.name}\n${t("signature.expert_subtitle")}`,
    },
    {
      title: t("signature.client_title"),
      subtitle: `${data.client.name}\n${t("signature.client_subtitle")}`,
    },
  ];

  boxes.forEach((box, index) => {
    const boxX = x + index * (boxWidth + 20);
    doc.save();
    doc
      .roundedRect(w.boxX(boxX, boxWidth), top, boxWidth, height, 4)
      .stroke(COLORS.line);
    w.text(report.upper(box.title), style("bold", 7.5, COLORS.muted), {
      x: boxX + 12,
      y: top + 10,
      width: boxWidth - 24,
      lineBreak: false,
    });
    w.text(box.subtitle, style("regular", 8.5, COLORS.ink), {
      x: boxX + 12,
      y: top + 24,
      width: boxWidth - 24,
    });
    doc.restore();
  });

  doc.y = top + height + 10;
};

const paintHeadersAndFooters = (report: Report, data: InspectionReportData) => {
  const { doc, w, t } = report;
  const range = doc.bufferedPageRange();

  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    const marginBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const x = doc.page.margins.left;
    const width = contentWidth(doc);
    const line = (y: number): TextBox => ({ x, y, width, lineBreak: false });

    doc.save();
    doc.rect(0, 0, doc.page.width, 72).fill(COLORS.primary);
    w.text("AutoSouk", style("bold", 18, COLORS.white), line(20));
    w.text(t("header.subtitle"), style("regular", 9, "#BBD3E8"), line(43));
    w.text(
      t("header.reference", { reference: data.reference }),
      style("bold", 10, COLORS.white),
      {
        ...line(22),
        align: "end",
      },
    );
    w.text(
      t("header.issued", { date: report.formatDate(data.issuedAt) }),
      style("regular", 8.5, "#BBD3E8"),
      { ...line(36), align: "end" },
    );
    w.text(t("header.confidential"), style("regular", 8.5, "#BBD3E8"), {
      ...line(48),
      align: "end",
    });
    doc.restore();

    const footerY = doc.page.height - 44;
    doc.save();
    doc
      .strokeColor(COLORS.line)
      .lineWidth(0.5)
      .moveTo(x, footerY - 8)
      .lineTo(x + width, footerY - 8)
      .stroke();
    w.text(
      t("footer.notice", { reference: data.reference }),
      style("regular", 7, COLORS.muted),
      { x, y: footerY, width: width * 0.8, lineBreak: false },
    );
    w.text(
      t("footer.page", { page: index + 1, total: range.count }),
      style("bold", 7.5, COLORS.muted),
      { ...line(footerY), align: "end" },
    );
    doc.restore();

    doc.page.margins.bottom = marginBottom;
  }
};

// Codes and typed text keep their own direction inside right-to-left text.
const isolateValues = (
  report: Report,
  data: InspectionReportData,
): InspectionReportData => {
  const { code, userText } = report;
  const optional = (value: string | null, format: (value: string) => string) =>
    value === null ? null : format(value);
  return {
    ...data,
    reference: code(data.reference),
    vehicle: {
      ...data.vehicle,
      make: optional(data.vehicle.make, userText),
      model: optional(data.vehicle.model, userText),
      matricule: code(data.vehicle.matricule),
      vin: optional(data.vehicle.vin, code),
      carteGriseNumber: optional(data.vehicle.carteGriseNumber, code),
      mileageConsistencyNote: optional(
        data.vehicle.mileageConsistencyNote,
        userText,
      ),
    },
    expert: {
      ...data.expert,
      name: userText(data.expert.name),
      address: userText(data.expert.address),
      phone: optional(data.expert.phone, code),
    },
    client: { name: userText(data.client.name) },
    summary: userText(data.summary),
    sections: data.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => ({
        ...item,
        label: userText(item.label),
        note: item.note && userText(item.note),
      })),
    })),
  };
};

export const generateInspectionReportPdf = (
  input: InspectionReportData,
  locale: Locale,
): Promise<Buffer> => {
  const doc = new PDFDocument({
    size: "A4",
    bufferPages: true,
    lang: locale,
    margins: { top: 96, bottom: 62, left: 45, right: 45 },
    info: {
      Title: translate(locale, "pdf:document.title", {
        reference: input.reference,
      }),
      Author: `AutoSouk — ${input.expert.name}`,
      Subject: translate(locale, "pdf:document.subject", {
        matricule: input.vehicle.matricule,
      }),
      Keywords: translate(locale, "pdf:document.keywords"),
    },
  });
  const report = createReport(doc, locale);
  const data = isolateValues(report, input);
  const { w, t } = report;

  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const result = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  // Isolated as a whole: make and model isolated apart would swap in Arabic.
  const vehicleTitle = [input.vehicle.make, input.vehicle.model]
    .filter(Boolean)
    .join(" ")
    .trim();
  const intro: TextBox = {
    x: doc.page.margins.left,
    y: doc.y,
    width: contentWidth(doc),
  };
  const introStyle = style("regular", 9.5, COLORS.muted);

  intro.y += w.text(
    vehicleTitle ? report.userText(vehicleTitle) : t("intro.vehicle_fallback"),
    style("bold", 15, COLORS.ink),
    intro,
  );
  intro.y += w.text(
    t("intro.summary", {
      matricule: data.vehicle.matricule,
      year: data.vehicle.year,
      mileage: report.formatNumber(data.vehicle.mileageKm),
    }),
    introStyle,
    intro,
  );
  intro.y += w.text(
    t("intro.inspection", {
      date: report.formatDateTime(data.inspectedAt),
      client: data.client.name,
    }),
    introStyle,
    intro,
  );
  doc.y = intro.y + 14;

  verdictPanel(report, data);

  const { vehicle, administrative, expert } = data;
  sectionTitle(report, t("sections.vehicle"));
  keyValueGrid(report, [
    { label: t("fields.make"), value: notProvided(report, vehicle.make) },
    { label: t("fields.model"), value: notProvided(report, vehicle.model) },
    { label: t("fields.matricule"), value: vehicle.matricule },
    { label: t("fields.vin"), value: notProvided(report, vehicle.vin) },
    {
      label: t("fields.carte_grise"),
      value: notProvided(report, vehicle.carteGriseNumber),
    },
    { label: t("fields.year"), value: String(vehicle.year) },
    {
      label: t("fields.first_registration"),
      value: report.formatDate(vehicle.firstRegistrationDate),
    },
    {
      label: t("fields.mileage"),
      value: t("values.km", { value: report.formatNumber(vehicle.mileageKm) }),
    },
    {
      label: t("fields.mileage_consistency"),
      value: t(`mileage.${vehicle.mileageConsistency}.label`),
    },
    {
      label: t("fields.fuel"),
      value: vehicle.fuel
        ? report.label("carburant", vehicle.fuel)
        : t("values.not_provided"),
    },
    {
      label: t("fields.transmission"),
      value: report.label("transmission", vehicle.transmission),
    },
    {
      label: t("fields.fiscal_power"),
      value: t("values.fiscal_power", { value: vehicle.fiscalPower }),
    },
    { label: t("fields.doors"), value: String(vehicle.doorsNumber) },
    { label: t("fields.owners"), value: String(vehicle.ownersCount) },
    {
      label: t("fields.origin"),
      value: vehicle.origin
        ? report.label("car_origin", vehicle.origin)
        : t("values.not_provided"),
    },
    {
      label: t("fields.city"),
      value: lookupLabel(report, "city", vehicle.city),
    },
  ]);

  mileageConsistencyCallout(report, data);

  const yesNo = (value: boolean) => t(value ? "values.yes" : "values.no");
  sectionTitle(report, t("sections.administrative"));
  keyValueGrid(report, [
    {
      label: t("fields.controle_technique_valid"),
      value: yesNo(administrative.controleTechniqueValid),
    },
    {
      label: t("fields.controle_technique_expiry"),
      value: report.formatDate(administrative.controleTechniqueExpiry),
    },
    { label: t("fields.vignette"), value: yesNo(administrative.vignetteValid) },
    {
      label: t("fields.carte_grise_presented"),
      value: vehicle.carteGriseNumber
        ? t("values.yes")
        : t("values.not_presented"),
    },
  ]);

  sectionTitle(report, t("sections.expert"));
  keyValueGrid(report, [
    { label: t("fields.expert_name"), value: expert.name },
    { label: t("fields.phone"), value: notProvided(report, expert.phone) },
    { label: t("fields.address"), value: expert.address },
    {
      label: t("fields.expert_city"),
      value: lookupLabel(report, "city", expert.city),
    },
  ]);

  data.sections.forEach((section) => {
    // heading + table header + one row must fit together
    sectionTitle(
      report,
      report.label("inspection_category", section.category),
      120,
    );
    findingsTable(report, section.items);
  });

  anomaliesSummary(report, data);
  repairEstimate(report, data);
  conclusion(report, data);
  legalSection(report);
  signatureBlock(report, data);

  paintHeadersAndFooters(report, data);
  doc.end();

  return result;
};
