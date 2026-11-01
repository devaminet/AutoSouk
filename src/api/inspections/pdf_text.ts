import path from "path";
import bidiFactory from "bidi-js";

type Doc = PDFKit.PDFDocument;

export type FontWeight = "regular" | "bold";

export type TextStyle = {
  weight: FontWeight;
  size: number;
  color: string;
};

// Positions are logical: `x` is measured from the start edge (left in a
// left-to-right report, right in a right-to-left one), `align` follows the
// reading direction, and `justify` only applies to left-to-right text.
export type TextBox = {
  x: number;
  y: number;
  width: number;
  align?: "start" | "end" | "center";
  justify?: boolean;
  lineBreak?: boolean;
  ellipsis?: boolean;
  /** Keeps left-to-right order in a right-to-left report (scores, codes). */
  ltr?: boolean;
};

export type PdfText = {
  rtl: boolean;
  /** The physical x of a box given by its logical x and width. */
  boxX: (x: number, width: number) => number;
  /** Draws the text and returns the height it took. */
  text: (content: string, style: TextStyle, box: TextBox) => number;
  heightOf: (content: string, style: TextStyle, width: number) => number;
};

const fontsDirectory = path.join(__dirname, "../../assets/fonts");

// IBM Plex Sans Arabic covers Arabic and Latin, so mixed lines (plates, VINs,
// names) keep one baseline. PDF standard fonts have no Arabic glyphs.
const rtlFonts: Record<FontWeight, string> = {
  regular: path.join(fontsDirectory, "IBMPlexSansArabic-Regular.ttf"),
  bold: path.join(fontsDirectory, "IBMPlexSansArabic-Bold.ttf"),
};

const ltrFonts: Record<FontWeight, string> = {
  regular: "Helvetica",
  bold: "Helvetica-Bold",
};

const bidi = bidiFactory();

const arabicLetter =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC]/;

// Direction marks and isolates steer the bidi algorithm but have no glyph.
const bidiControl = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/;

const bidiControls = new RegExp(bidiControl.source, "g");

/**
 * Splits one line into pieces in visual order (left to right). The whole line
 * is reordered here with the bidi algorithm (brackets in right-to-left text
 * are mirrored). pdfkit lays out each word on its own and fontkit shapes and
 * reverses Arabic, so every Arabic word goes back to its logical order to be
 * shaped; everything else (Latin, digits, spaces, punctuation) is already in
 * visual order.
 */
export const visualRuns = (line: string): string[] => {
  const levels = bidi.getEmbeddingLevels(line, "rtl");
  // bidi-js indexes UTF-16 code units, like split("").
  const chars = line.split("");
  bidi
    .getMirroredCharactersMap(line, levels.levels)
    .forEach((mirrored, index) => (chars[index] = mirrored));

  const runs: { arabic: boolean; chars: string[] }[] = [];
  for (const index of bidi.getReorderedIndices(line, levels)) {
    if (bidiControl.test(chars[index])) continue;
    const arabic = arabicLetter.test(chars[index]);
    const last = runs[runs.length - 1];
    if (last && last.arabic === arabic) {
      last.chars.push(chars[index]);
    } else {
      runs.push({ arabic, chars: [chars[index]] });
    }
  }

  return runs.map(({ arabic, chars: visual }) =>
    (arabic ? [...visual].reverse() : visual).join(""),
  );
};

const ltrAlign = {
  start: "left",
  end: "right",
  center: "center",
} as const;

const createLtrText = (doc: Doc): PdfText => {
  const use = (style: TextStyle) =>
    doc
      .font(ltrFonts[style.weight])
      .fontSize(style.size)
      .fillColor(style.color);

  return {
    rtl: false,
    boxX: (x) => x,
    heightOf: (content, style, width) =>
      use(style).heightOfString(content, { width }),
    text: (content, style, box) => {
      const align = box.justify ? "justify" : ltrAlign[box.align ?? "start"];
      const options: PDFKit.Mixins.TextOptions = {
        width: box.width,
        align,
        lineBreak: box.lineBreak ?? true,
        ellipsis: box.ellipsis,
      };
      use(style).text(content, box.x, box.y, options);
      return box.lineBreak === false
        ? doc.currentLineHeight(true)
        : doc.heightOfString(content, options);
    },
  };
};

const createRtlText = (doc: Doc): PdfText => {
  const use = (style: TextStyle) =>
    doc
      .font(rtlFonts[style.weight])
      .fontSize(style.size)
      .fillColor(style.color);

  // Control marks have no glyph, so they must not count towards widths.
  const widthOf = (line: string) =>
    doc.widthOfString(line.replace(bidiControls, ""));

  // Greedy word wrap on the logical text; each line is reordered afterwards.
  const wrap = (content: string, width: number) =>
    content.split("\n").flatMap((paragraph) => {
      const lines: string[] = [];
      let current = "";
      for (const word of paragraph.split(" ")) {
        const candidate = current ? `${current} ${word}` : word;
        if (current && widthOf(candidate) > width) {
          lines.push(current);
          current = word;
        } else {
          current = candidate;
        }
      }
      lines.push(current);
      return lines;
    });

  const truncate = (line: string, width: number) => {
    if (widthOf(line) <= width) {
      return line;
    }
    let shortened = line;
    while (shortened.length > 0 && widthOf(`${shortened}…`) > width) {
      shortened = shortened.slice(0, -1);
    }
    return `${shortened.trimEnd()}…`;
  };

  const boxX = (x: number, width: number) => doc.page.width - x - width;

  return {
    rtl: true,
    boxX,
    heightOf: (content, style, width) => {
      use(style);
      return wrap(content, width).length * doc.currentLineHeight(true);
    },
    text: (content, style, box) => {
      use(style);
      const lines =
        box.lineBreak === false
          ? [box.ellipsis ? truncate(content, box.width) : content]
          : wrap(content, box.width);
      const lineHeight = doc.currentLineHeight(true);
      const left = boxX(box.x, box.width);

      lines.forEach((line, index) => {
        const runs = box.ltr ? [line] : visualRuns(line);
        const lineWidth = runs.reduce((total, run) => total + widthOf(run), 0);
        const align = box.align ?? "start";
        let cursor =
          align === "start"
            ? left + box.width - lineWidth
            : align === "end"
              ? left
              : left + (box.width - lineWidth) / 2;
        const y = box.y + index * lineHeight;
        runs.forEach((run) => {
          doc.text(run, cursor, y, { lineBreak: false });
          cursor += widthOf(run);
        });
      });

      return lines.length * lineHeight;
    },
  };
};

const isolates = { ltr: "\u2066", auto: "\u2068" } as const;

/**
 * Wraps a value in a Unicode isolate so that right-to-left text around it
 * cannot reorder it: "ltr" for codes (plates, VINs, phone numbers), "auto"
 * for text people typed, which then reads in the direction of its first
 * letter.
 */
export const isolate = (value: string, direction: keyof typeof isolates) =>
  `${isolates[direction]}${value}\u2069`;

export const createPdfText = (doc: Doc, rtl: boolean): PdfText =>
  rtl ? createRtlText(doc) : createLtrText(doc);
