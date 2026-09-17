import PDFDocument from "pdfkit";

type Doc = PDFKit.PDFDocument;

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
    city: string | null;
  };
  administrative: {
    controleTechniqueValid: boolean;
    controleTechniqueExpiry: string | null;
    vignetteValid: boolean;
  };
  expert: {
    name: string;
    address: string;
    city: string | null;
    phone: string | null;
  };
  client: { name: string };
  verdict: "excellent" | "good" | "fair" | "poor";
  overallScore: number;
  summary: string;
  sections: {
    category: string;
    items: { label: string; status: "pass" | "attention" | "fail"; note?: string }[];
  }[];
  estimatedRepairCost?: number;
};

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

const STATUS = {
  pass: { label: "Conforme", color: COLORS.pass },
  attention: { label: "À surveiller", color: COLORS.attention },
  fail: { label: "Défaillant", color: COLORS.fail },
};

const CATEGORY_LABELS: Record<string, string> = {
  exterior: "Carrosserie et extérieur",
  interior: "Habitacle et intérieur",
  mechanical: "Organes mécaniques",
  electrical: "Électricité et électronique",
  under_vehicle: "Soubassement et châssis",
  road_test: "Essai routier",
};

const VERDICTS = {
  excellent: {
    label: "Excellent état",
    color: COLORS.pass,
    advice:
      "Véhicule en excellent état général. Aucune réserve majeure n'a été relevée lors de l'expertise.",
  },
  good: {
    label: "Bon état",
    color: COLORS.pass,
    advice:
      "Véhicule en bon état général. Quelques points sont à surveiller sans caractère de gravité.",
  },
  fair: {
    label: "État moyen",
    color: COLORS.attention,
    advice:
      "Véhicule en état moyen. Des réparations sont à prévoir à court terme et à intégrer à la négociation.",
  },
  poor: {
    label: "État médiocre",
    color: COLORS.fail,
    advice:
      "Véhicule en état médiocre. Des réparations importantes sont nécessaires avant toute acquisition.",
  },
};

const LEGAL_NOTICE =
  "Le présent rapport est une expertise technique privée réalisée à la demande du client. " +
  "Il ne constitue pas un procès-verbal de visite technique et ne remplace en aucun cas le contrôle " +
  "technique obligatoire délivré par un centre agréé par la NARSA (Agence Nationale de la Sécurité " +
  "Routière). Il ne vaut ni certificat d'immatriculation, ni attestation de conformité administrative.";

const MILEAGE_CONSISTENCY = {
  consistent: {
    label: "Cohérent",
    tone: COLORS.pass,
    background: "#EAF5EF",
    border: "#A9D5BC",
    title: "Kilométrage cohérent",
    fallback:
      "Le kilométrage affiché est cohérent avec les éléments de recoupement disponibles lors de l'expertise.",
  },
  suspicious: {
    label: "Incohérent — suspicion de trafic",
    tone: COLORS.fail,
    background: "#FBEBE9",
    border: "#E8B4AE",
    title: "Alerte — kilométrage suspect",
    fallback:
      "Des écarts ont été relevés entre le kilométrage affiché et les éléments de recoupement disponibles. Une vérification approfondie est recommandée avant toute acquisition.",
  },
  unverifiable: {
    label: "Non vérifiable",
    tone: COLORS.attention,
    background: "#FCF3E8",
    border: "#E6C79C",
    title: "Kilométrage non vérifiable",
    fallback:
      "Les éléments permettant de recouper le kilométrage affiché (calculateurs, historique d'entretien, visites techniques antérieures) n'étaient pas disponibles lors de l'expertise.",
  },
};

const LEGAL_POINTS = [
  "Les constatations portent exclusivement sur les éléments accessibles sans démontage, à la date et à l'heure de l'expertise.",
  "L'expertise ne comprend ni démontage moteur, ni dépose d'organes, ni essai en banc de puissance, sauf mention expresse contraire.",
  "Le kilométrage indiqué est celui relevé au compteur. L'expert en apprécie la cohérence à partir des éléments disponibles (calculateurs embarqués, historique d'entretien, visites techniques antérieures) sans pouvoir en garantir l'authenticité.",
  "Les estimations de réparation sont données à titre indicatif hors taxes et hors pièces d'origine constructeur.",
  "La responsabilité de l'expert et d'AutoSouk ne saurait être engagée pour tout défaut apparu postérieurement à la date d'expertise.",
];

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const numberFormatter = new Intl.NumberFormat("fr-FR");

// WinAnsi (PDF standard fonts) has no narrow/non-breaking space: Intl emits them
// as thousands separators and they render as stray glyphs.
const sanitize = (value: string) => value.replace(/[\u00A0\u202F\u2009]/g, " ");

const formatNumber = (value: number) => sanitize(numberFormatter.format(value));

const formatDate = (value: Date | string | null | undefined) => {
  if (!value) return "Non renseigné";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? "Non renseigné"
    : sanitize(dateFormatter.format(date));
};

const formatDateTime = (value: Date) => sanitize(dateTimeFormatter.format(value));

const formatMad = (value: number) => `${formatNumber(value)} MAD`;

const yesNo = (value: boolean) => (value ? "Oui" : "Non");

const contentWidth = (doc: Doc) =>
  doc.page.width - doc.page.margins.left - doc.page.margins.right;

const bottomLimit = (doc: Doc) => doc.page.height - doc.page.margins.bottom;

const ensureSpace = (doc: Doc, needed: number) => {
  if (doc.y + needed > bottomLimit(doc)) {
    doc.addPage();
  }
};

// `reserve` keeps the heading on the same page as the block that follows it.
const sectionTitle = (doc: Doc, title: string, reserve = 46) => {
  ensureSpace(doc, reserve);
  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  const top = doc.y;

  doc.save();
  doc.rect(x, top, width, 22).fill(COLORS.primarySoft);
  doc.rect(x, top, 3, 22).fill(COLORS.primary);
  doc
    .fillColor(COLORS.primary)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(title.toUpperCase(), x + 12, top + 7, { width: width - 20, lineBreak: false });
  doc.restore();

  doc.y = top + 22 + 10;
};

const keyValueGrid = (
  doc: Doc,
  pairs: { label: string; value: string }[],
  columns = 2,
) => {
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

      doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor(COLORS.muted)
        .text(pair.label.toUpperCase(), cellX, rowTop, {
          width: columnWidth - 12,
          lineBreak: false,
        });
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(COLORS.ink)
        .text(pair.value, cellX, rowTop + 11, {
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
  doc: Doc,
  x: number,
  y: number,
  status: keyof typeof STATUS,
) => {
  const { label, color } = STATUS[status];
  const width = 74;
  const height = 15;

  doc.save();
  doc.roundedRect(x, y, width, height, 7.5).fill(color);
  doc
    .fillColor(COLORS.white)
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .text(label.toUpperCase(), x, y + 4.5, {
      width,
      align: "center",
      lineBreak: false,
    });
  doc.restore();
};

const findingsTable = (
  doc: Doc,
  items: { label: string; status: "pass" | "attention" | "fail"; note?: string }[],
) => {
  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  const columns = [width * 0.42, width * 0.19, width * 0.39];
  const padding = 7;

  const drawHeader = () => {
    const top = doc.y;
    doc.save();
    doc.rect(x, top, width, 20).fill(COLORS.primary);
    doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(8);
    doc.text("POINT CONTRÔLÉ", x + padding, top + 6.5, {
      width: columns[0] - padding,
      lineBreak: false,
    });
    doc.text("ÉTAT", x + columns[0] + padding, top + 6.5, {
      width: columns[1] - padding,
      lineBreak: false,
    });
    doc.text("OBSERVATIONS", x + columns[0] + columns[1] + padding, top + 6.5, {
      width: columns[2] - padding,
      lineBreak: false,
    });
    doc.restore();
    doc.y = top + 20;
  };

  ensureSpace(doc, 60);
  drawHeader();

  items.forEach((item, index) => {
    doc.font("Helvetica").fontSize(9);
    const labelHeight = doc.heightOfString(item.label, {
      width: columns[0] - padding * 2,
    });
    const noteHeight = doc.heightOfString(item.note || "—", {
      width: columns[2] - padding * 2,
    });
    const rowHeight = Math.max(labelHeight, noteHeight, 15) + padding * 2;

    if (doc.y + rowHeight > bottomLimit(doc)) {
      doc.addPage();
      drawHeader();
    }

    const top = doc.y;
    if (index % 2 === 1) {
      doc.save().rect(x, top, width, rowHeight).fill(COLORS.zebra).restore();
    }

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLORS.ink)
      .text(item.label, x + padding, top + padding, {
        width: columns[0] - padding * 2,
      });

    statusChip(doc, x + columns[0] + padding, top + padding, item.status);

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(item.note ? COLORS.ink : COLORS.muted)
      .text(item.note || "—", x + columns[0] + columns[1] + padding, top + padding, {
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

const mileageConsistencyCallout = (doc: Doc, data: InspectionReportData) => {
  const config = MILEAGE_CONSISTENCY[data.vehicle.mileageConsistency];
  const body = data.vehicle.mileageConsistencyNote || config.fallback;
  const x = doc.page.margins.left;
  const width = contentWidth(doc);

  doc.font("Helvetica").fontSize(8.5);
  const bodyHeight = doc.heightOfString(body, { width: width - 28 });
  const height = bodyHeight + 30;

  ensureSpace(doc, height + 10);
  const top = doc.y;

  doc.save();
  doc
    .roundedRect(x, top, width, height, 4)
    .fillAndStroke(config.background, config.border);
  doc
    .fillColor(config.tone)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(config.title.toUpperCase(), x + 14, top + 10, {
      width: width - 28,
      lineBreak: false,
    });
  doc
    .fillColor(COLORS.ink)
    .font("Helvetica")
    .fontSize(8.5)
    .text(body, x + 14, top + 23, { width: width - 28 });
  doc.restore();

  doc.y = top + height + 10;
};

const verdictPanel = (doc: Doc, data: InspectionReportData) => {
  const verdict = VERDICTS[data.verdict];
  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  const height = 92;

  ensureSpace(doc, height + 14);
  const top = doc.y;

  doc.save();
  doc.roundedRect(x, top, width, height, 4).fillAndStroke(COLORS.zebra, COLORS.line);
  doc.roundedRect(x, top, 4, height, 2).fill(verdict.color);

  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(8)
    .text("APPRÉCIATION GÉNÉRALE", x + 16, top + 14, { lineBreak: false });
  doc
    .fillColor(verdict.color)
    .font("Helvetica-Bold")
    .fontSize(17)
    .text(verdict.label, x + 16, top + 27, { lineBreak: false });
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(8.5)
    .text(verdict.advice, x + 16, top + 54, { width: width * 0.58 });

  const gaugeWidth = 150;
  const gaugeX = x + width - gaugeWidth - 16;
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(8)
    .text("NOTE GLOBALE", gaugeX, top + 14, {
      width: gaugeWidth,
      align: "right",
      lineBreak: false,
    });
  doc
    .fillColor(COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(20)
    .text(`${data.overallScore}`, gaugeX, top + 26, {
      width: gaugeWidth - 34,
      align: "right",
      lineBreak: false,
    });
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(11)
    .text("/100", gaugeX + gaugeWidth - 30, top + 34, { lineBreak: false });

  const barY = top + 58;
  doc.roundedRect(gaugeX, barY, gaugeWidth, 8, 4).fill(COLORS.line);
  const filled = Math.max(4, (gaugeWidth * data.overallScore) / 100);
  doc.roundedRect(gaugeX, barY, filled, 8, 4).fill(verdict.color);
  doc.restore();

  doc.y = top + height + 14;
};

const anomaliesSummary = (doc: Doc, data: InspectionReportData) => {
  const anomalies = data.sections.flatMap((section) =>
    section.items
      .filter((item) => item.status !== "pass")
      .map((item) => ({
        category: CATEGORY_LABELS[section.category] ?? section.category,
        ...item,
      })),
  );

  sectionTitle(doc, "Synthèse des anomalies relevées", 90);

  if (anomalies.length === 0) {
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(COLORS.pass)
      .text(
        "Aucune anomalie n'a été relevée sur les points contrôlés lors de cette expertise.",
        doc.page.margins.left,
        doc.y,
        { width: contentWidth(doc) },
      );
    doc.y += 14;
    return;
  }

  const x = doc.page.margins.left;
  const width = contentWidth(doc);

  anomalies.forEach((anomaly) => {
    const text = `${anomaly.category} — ${anomaly.label}${anomaly.note ? ` : ${anomaly.note}` : ""}`;
    doc.font("Helvetica").fontSize(9.5);
    const textHeight = doc.heightOfString(text, { width: width - 96 });
    const rowHeight = Math.max(textHeight, 15) + 10;

    ensureSpace(doc, rowHeight);
    const top = doc.y;
    statusChip(doc, x, top, anomaly.status);
    doc
      .fillColor(COLORS.ink)
      .font("Helvetica")
      .fontSize(9.5)
      .text(text, x + 86, top + 1, { width: width - 96 });
    doc.y = top + rowHeight;
  });

  doc.y += 6;
};

const repairEstimate = (doc: Doc, data: InspectionReportData) => {
  if (data.estimatedRepairCost === undefined) return;

  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  const height = 52;

  sectionTitle(doc, "Estimation des réparations à prévoir", height + 44);

  ensureSpace(doc, height + 12);
  const top = doc.y;

  doc.save();
  doc.roundedRect(x, top, width, height, 4).fillAndStroke(COLORS.primarySoft, COLORS.line);
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(8)
    .text("MONTANT ESTIMÉ DES TRAVAUX (À TITRE INDICATIF)", x + 16, top + 14, {
      lineBreak: false,
    });
  doc
    .fillColor(COLORS.primary)
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(formatMad(data.estimatedRepairCost), x + 16, top + 26, { lineBreak: false });
  doc.restore();

  doc.y = top + height + 12;
};

const conclusion = (doc: Doc, data: InspectionReportData) => {
  const x = doc.page.margins.left;
  const width = contentWidth(doc);

  doc.font("Helvetica").fontSize(10);
  const textHeight = doc.heightOfString(data.summary, { width: width - 28, align: "justify" });
  const height = textHeight + 28;

  sectionTitle(doc, "Conclusion de l'expert", height + 44);

  ensureSpace(doc, height + 12);
  const top = doc.y;

  doc.save();
  doc.roundedRect(x, top, width, height, 4).fillAndStroke(COLORS.white, COLORS.line);
  doc
    .fillColor(COLORS.ink)
    .font("Helvetica")
    .fontSize(10)
    .text(data.summary, x + 14, top + 14, { width: width - 28, align: "justify" });
  doc.restore();

  doc.y = top + height + 12;
};

const legalSection = (doc: Doc) => {
  const x = doc.page.margins.left;
  const width = contentWidth(doc);

  doc.font("Helvetica-Bold").fontSize(8.5);
  const noticeHeight = doc.heightOfString(LEGAL_NOTICE, { width: width - 28, align: "justify" });

  sectionTitle(doc, "Mentions légales et limites de l'expertise", noticeHeight + 66);

  ensureSpace(doc, noticeHeight + 24);
  const top = doc.y;
  doc.save();
  doc
    .roundedRect(x, top, width, noticeHeight + 20, 4)
    .fillAndStroke("#FCF3E8", "#E6C79C");
  doc
    .fillColor("#8A5A12")
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .text(LEGAL_NOTICE, x + 14, top + 10, { width: width - 28, align: "justify" });
  doc.restore();
  doc.y = top + noticeHeight + 30;

  LEGAL_POINTS.forEach((point) => {
    doc.font("Helvetica").fontSize(8.5);
    const height = doc.heightOfString(point, { width: width - 14 });
    ensureSpace(doc, height + 6);
    const lineTop = doc.y;
    doc
      .fillColor(COLORS.muted)
      .font("Helvetica")
      .fontSize(8.5)
      .text("•", x, lineTop, { width: 10, lineBreak: false })
      .text(point, x + 12, lineTop, { width: width - 14, align: "justify" });
    doc.y = lineTop + height + 4;
  });

  doc.y += 6;
};

const signatureBlock = (doc: Doc, data: InspectionReportData) => {
  const x = doc.page.margins.left;
  const width = contentWidth(doc);
  const boxWidth = (width - 20) / 2;
  const height = 96;

  ensureSpace(doc, height + 34);

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLORS.ink)
    .text(
      `Fait à ${data.expert.city ?? "—"}, le ${formatDate(data.issuedAt)}`,
      x,
      doc.y,
      { width, lineBreak: false },
    );
  doc.y += 18;

  const top = doc.y;
  const boxes = [
    { title: "L'EXPERT / LE GARAGE", subtitle: `${data.expert.name}\nSignature et cachet` },
    { title: "LE CLIENT", subtitle: `${data.client.name}\nLu et approuvé` },
  ];

  boxes.forEach((box, index) => {
    const boxX = x + index * (boxWidth + 20);
    doc.save();
    doc.roundedRect(boxX, top, boxWidth, height, 4).stroke(COLORS.line);
    doc
      .fillColor(COLORS.muted)
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .text(box.title, boxX + 12, top + 10, { width: boxWidth - 24, lineBreak: false });
    doc
      .fillColor(COLORS.ink)
      .font("Helvetica")
      .fontSize(8.5)
      .text(box.subtitle, boxX + 12, top + 24, { width: boxWidth - 24 });
    doc.restore();
  });

  doc.y = top + height + 10;
};

const paintHeadersAndFooters = (doc: Doc, data: InspectionReportData) => {
  const range = doc.bufferedPageRange();

  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    const marginBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const x = doc.page.margins.left;
    const width = contentWidth(doc);

    doc.save();
    doc.rect(0, 0, doc.page.width, 72).fill(COLORS.primary);
    doc
      .fillColor(COLORS.white)
      .font("Helvetica-Bold")
      .fontSize(18)
      .text("AutoSouk", x, 20, { lineBreak: false });
    doc
      .fillColor("#BBD3E8")
      .font("Helvetica")
      .fontSize(9)
      .text("Rapport d'expertise automobile", x, 43, { lineBreak: false });
    doc
      .fillColor(COLORS.white)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(`N° ${data.reference}`, x, 22, { width, align: "right", lineBreak: false });
    doc
      .fillColor("#BBD3E8")
      .font("Helvetica")
      .fontSize(8.5)
      .text(`Établi le ${formatDate(data.issuedAt)}`, x, 36, {
        width,
        align: "right",
        lineBreak: false,
      });
    doc
      .fillColor("#BBD3E8")
      .font("Helvetica")
      .fontSize(8.5)
      .text(`Document confidentiel`, x, 48, {
        width,
        align: "right",
        lineBreak: false,
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
    doc
      .fillColor(COLORS.muted)
      .font("Helvetica")
      .fontSize(7)
      .text(
        `Rapport N° ${data.reference} · Expertise privée — ne remplace pas la visite technique obligatoire (centres agréés NARSA)`,
        x,
        footerY,
        { width: width * 0.8, lineBreak: false },
      );
    doc
      .fillColor(COLORS.muted)
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .text(`Page ${index + 1} / ${range.count}`, x, footerY, {
        width,
        align: "right",
        lineBreak: false,
      });
    doc.restore();

    doc.page.margins.bottom = marginBottom;
  }
};

export const generateInspectionReportPdf = (
  data: InspectionReportData,
): Promise<Buffer> => {
  const doc = new PDFDocument({
    size: "A4",
    bufferPages: true,
    margins: { top: 96, bottom: 62, left: 45, right: 45 },
    info: {
      Title: `Rapport d'expertise ${data.reference}`,
      Author: `AutoSouk — ${data.expert.name}`,
      Subject: `Expertise technique du véhicule ${data.vehicle.matricule}`,
      Keywords: "expertise, automobile, AutoSouk, Maroc",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const result = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const vehicleTitle = [data.vehicle.make, data.vehicle.model]
    .filter(Boolean)
    .join(" ")
    .trim();

  doc
    .font("Helvetica-Bold")
    .fontSize(15)
    .fillColor(COLORS.ink)
    .text(vehicleTitle || "Véhicule", doc.page.margins.left, doc.y, {
      width: contentWidth(doc),
    });
  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor(COLORS.muted)
    .text(
      `Immatriculation ${data.vehicle.matricule} · Année ${data.vehicle.year} · ${formatNumber(data.vehicle.mileageKm)} km au compteur`,
      { width: contentWidth(doc) },
    );
  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor(COLORS.muted)
    .text(
      `Expertise réalisée le ${formatDateTime(data.inspectedAt)} · Rapport établi à la demande de ${data.client.name}`,
      { width: contentWidth(doc) },
    );
  doc.y += 14;

  verdictPanel(doc, data);

  sectionTitle(doc, "Identification du véhicule");
  keyValueGrid(doc, [
    { label: "Marque", value: data.vehicle.make ?? "Non renseigné" },
    { label: "Modèle", value: data.vehicle.model ?? "Non renseigné" },
    { label: "Immatriculation (matricule)", value: data.vehicle.matricule },
    { label: "Numéro de châssis (VIN)", value: data.vehicle.vin ?? "Non renseigné" },
    { label: "Numéro de carte grise", value: data.vehicle.carteGriseNumber ?? "Non renseigné" },
    { label: "Année du modèle", value: String(data.vehicle.year) },
    {
      label: "Première mise en circulation",
      value: formatDate(data.vehicle.firstRegistrationDate),
    },
    {
      label: "Kilométrage relevé",
      value: `${formatNumber(data.vehicle.mileageKm)} km`,
    },
    {
      label: "Cohérence du kilométrage",
      value: MILEAGE_CONSISTENCY[data.vehicle.mileageConsistency].label,
    },
    { label: "Énergie", value: data.vehicle.fuel ?? "Non renseigné" },
    {
      label: "Boîte de vitesses",
      value: data.vehicle.transmission === "automatic" ? "Automatique" : "Manuelle",
    },
    { label: "Puissance fiscale", value: `${data.vehicle.fiscalPower} CV` },
    { label: "Nombre de portes", value: String(data.vehicle.doorsNumber) },
    { label: "Nombre de propriétaires", value: String(data.vehicle.ownersCount) },
    { label: "Origine du véhicule", value: data.vehicle.origin ?? "Non renseigné" },
    { label: "Ville de localisation", value: data.vehicle.city ?? "Non renseigné" },
  ]);

  mileageConsistencyCallout(doc, data);

  sectionTitle(doc, "Situation administrative déclarée");
  keyValueGrid(doc, [
    {
      label: "Visite technique en cours de validité",
      value: yesNo(data.administrative.controleTechniqueValid),
    },
    {
      label: "Échéance de la visite technique",
      value: formatDate(data.administrative.controleTechniqueExpiry),
    },
    { label: "Vignette à jour", value: yesNo(data.administrative.vignetteValid) },
    {
      label: "Carte grise présentée",
      value: data.vehicle.carteGriseNumber ? "Oui" : "Non présentée",
    },
  ]);

  sectionTitle(doc, "Expert ayant réalisé le contrôle");
  keyValueGrid(doc, [
    { label: "Garage / expert", value: data.expert.name },
    { label: "Téléphone", value: data.expert.phone ?? "Non renseigné" },
    { label: "Adresse", value: data.expert.address },
    { label: "Ville", value: data.expert.city ?? "Non renseigné" },
  ]);

  data.sections.forEach((section) => {
    // heading + table header + one row must fit together
    sectionTitle(doc, CATEGORY_LABELS[section.category] ?? section.category, 120);
    findingsTable(doc, section.items);
  });

  anomaliesSummary(doc, data);
  repairEstimate(doc, data);
  conclusion(doc, data);
  legalSection(doc);
  signatureBlock(doc, data);

  paintHeadersAndFooters(doc, data);
  doc.end();

  return result;
};
