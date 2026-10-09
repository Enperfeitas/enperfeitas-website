/* =========================================================================
   Imposition math + PDF I/O, pure logic, no React.

   Terminology used throughout:
     "content page" , a real page from the uploaded PDF (1-indexed, as the
                        reader will see it in the finished book).
     "signature"    , a group of nested, folded sheets that get sewn
                        together as one unit; a book is made of one or more
                        signatures bound side by side along the spine.
     "sheet"        , one physical piece of paper, printed on both sides,
                        that gets folded once and nested inside (or around)
                        the other sheets of its signature. Printing a sheet
                        means printing a 2-up spread on the front and a 2-up
                        spread on the back.
     sheet index i=0. The OUTERMOST sheet of a signature (it wraps around
                        every other sheet, so it carries the signature's
                        first and last content pages). i = sheetsInSig-1 is
                        the INNERMOST sheet (the one straddling the true
                        centre fold).

   ---- Saddle-stitch imposition formula (single signature, P pages) -------
   For sheet i (0-indexed) of a signature padded to P pages:
     front-left  = P - 2i
     front-right = 2i + 1
     back-left   = 2i + 2
     back-right  = P - 2i - 1
   Both halves of a spread sit upright, side by side, no rotation is
   needed for a plain saddle-stitch spread (unlike, say, work-and-turn
   sheetwork for perfect binding).

   ---- Multi-signature (sewn sections) -------------------------------------
   The book is split into consecutive blocks of `sheetsPerSignature * 4`
   content pages. Each block is imposed independently, exactly as its own
   mini saddle-stitch booklet (local page numbers 1..paddedCount), then the
   local page numbers are mapped back to the book's real page numbers. The
   last signature may come up short and get padded with its own blank
   pages, same as a single-signature booklet would.

   ---- Creep / shingling compensation --------------------------------------
   As more sheets are folded and nested together, the accumulated paper
   thickness pushes the INNER sheets outward, so before trimming the
   innermost sheet's fore-edge sticks out furthest and the outermost
   sheet (the cover) barely moves at all. Since a folded-and-nested
   signature is trimmed with one straight cut, the inner sheets lose more
   paper off their fore-edge than the outer ones. Left uncompensated,
   that makes the live content on inner pages sit closer to the trim edge
   (or get clipped) than on outer pages. (Confirmed against multiple
   independent prepress references -- cedargraphicsinc.com, printivity.com,
   smartpress.com -- which agree on both points: inner sheets protrude
   more, and the outermost/cover sheet needs ~no adjustment.)

   The fix is to nudge each sheet's printed content *toward the spine*
   before trimming, more so for inner sheets, tapering to no shift at all
   on the outermost sheet, so that after the single trim cut, every page
   in the signature ends up with the same margin. The total amount to
   compensate depends on paper thickness and how many sheets are nested,
   which this tool can't measure for you. It's exposed as a plain "total
   creep" number in millimetres, off by default, with guidance to get it
   by folding a real test signature and measuring the offset by hand.
   ========================================================================= */

// --- Paper presets (mm), for the SHEET being printed on ------------------
export const PAPER_PRESETS = {
  a4: { label: "A4 (210 × 297 mm)", w: 210, h: 297 },
  a3: { label: "A3 (297 × 420 mm)", w: 297, h: 420 },
  letter: { label: "US Letter (215.9 × 279.4 mm)", w: 215.9, h: 279.4 },
  tabloid: { label: "US Tabloid (279.4 × 431.8 mm)", w: 279.4, h: 431.8 },
};

export const PT_PER_MM = 72 / 25.4;
export const mmToPt = (mm) => mm * PT_PER_MM;
export const ptToMm = (pt) => pt / PT_PER_MM;

/**
 * Work out, for one signature of `paddedCount` local pages (a multiple of
 * 4), the front/back/left/right local page assignment for every sheet.
 */
function imposeSignatureLocal(paddedCount) {
  const sheetsInSig = paddedCount / 4;
  const sheets = [];
  for (let i = 0; i < sheetsInSig; i++) {
    sheets.push({
      index: i,
      front: { left: paddedCount - 2 * i, right: 2 * i + 1 },
      back: { left: 2 * i + 2, right: paddedCount - 2 * i - 1 },
    });
  }
  return sheets;
}

/**
 * Full imposition plan for a book of `contentPageCount` real pages.
 *
 * @param {number} contentPageCount total real pages in the uploaded PDF
 * @param {number} sheetsPerSignature how many sheets nest together per
 *   signature (1 = simplest possible booklet: everything in one signature)
 * @param {{enabled:boolean, totalMm:number}} creep
 * @returns {{signatures: Array, totalSheets: number, totalPaddedPages: number}}
 */
export function computeImposition(contentPageCount, sheetsPerSignature, creep) {
  const pagesPerSig = Math.max(1, sheetsPerSignature) * 4;
  const numSignatures = Math.max(1, Math.ceil(contentPageCount / pagesPerSig));
  const creepEnabled = !!(creep && creep.enabled && creep.totalMm > 0);
  const creepTotalMm = creepEnabled ? creep.totalMm : 0;

  const signatures = [];
  let totalSheets = 0;
  let totalPaddedPages = 0;

  for (let k = 0; k < numSignatures; k++) {
    const contentStart = k * pagesPerSig + 1;
    const contentEnd = Math.min((k + 1) * pagesPerSig, contentPageCount);
    const contentCount = Math.max(0, contentEnd - contentStart + 1);
    const paddedCount = Math.max(4, Math.ceil(contentCount / 4) * 4);
    const blanks = paddedCount - contentCount;
    const localSheets = imposeSignatureLocal(paddedCount);
    const sheetsInSig = localSheets.length;

    const toGlobal = (local) => {
      if (local < 1 || local > contentCount) return null; // blank
      return contentStart + local - 1;
    };

    // Creep shift per sheet: 0 at the outermost (cover) sheet, max at the
    // innermost (centrefold) sheet, split evenly across the sheets in
    // this signature -- the innermost sheet is the one paper thickness
    // pushes out furthest, so it's the one that needs the most inward
    // compensation.
    const shiftForSheet = (i) => {
      if (!creepEnabled || sheetsInSig <= 1) return 0;
      const step = creepTotalMm / (sheetsInSig - 1);
      return step * i;
    };

    const sheets = localSheets.map((s) => ({
      globalIndex: totalSheets + s.index,
      indexInSignature: s.index,
      sheetsInSignature: sheetsInSig,
      isOutermost: s.index === 0,
      isInnermost: s.index === sheetsInSig - 1,
      creepShiftMm: Math.round(shiftForSheet(s.index) * 100) / 100,
      front: {
        left: toGlobal(s.front.left),
        right: toGlobal(s.front.right),
      },
      back: {
        left: toGlobal(s.back.left),
        right: toGlobal(s.back.right),
      },
    }));

    signatures.push({
      index: k,
      contentStart,
      contentEnd: contentStart + contentCount - 1,
      contentCount,
      paddedCount,
      blanks,
      sheets,
    });

    totalSheets += sheetsInSig;
    totalPaddedPages += paddedCount;
  }

  return { signatures, totalSheets, totalPaddedPages, numSignatures: signatures.length };
}

/** Flat list of every sheet across every signature, in printing order. */
export function flattenSheets(imposition) {
  const out = [];
  for (const sig of imposition.signatures) {
    for (const sheet of sig.sheets) {
      out.push({ ...sheet, signatureIndex: sig.index });
    }
  }
  return out;
}

/**
 * Read basic info from an uploaded PDF: page count and the size of its
 * first page (used as "the" page size, a mixed-size source PDF is flagged
 * so the studio can catch it before printing, rather than silently
 * misimposing it).
 */
export async function readPdfInfo(PDFLib, bytes) {
  const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const pageCount = pages.length;
  const first = pages[0];
  const { width, height } = first.getSize();
  let mixedSizes = false;
  for (const p of pages) {
    const s = p.getSize();
    if (Math.abs(s.width - width) > 1 || Math.abs(s.height - height) > 1) {
      mixedSizes = true;
      break;
    }
  }
  return {
    doc,
    pageCount,
    pageWidthPt: width,
    pageHeightPt: height,
    mixedSizes,
  };
}

/**
 * Shared worker: build one imposed PDF (sheet-sized pages, front then back
 * for each given sheet, in order) from an explicit list of sheets. Both
 * generateImposedPdf (all sheets, one file) and
 * generateImposedPdfsBySignature (one file per signature) call this with
 * a different slice of sheets.
 *
 * @param {object} PDFLib the pdf-lib module
 * @param {Uint8Array} sourceBytes the uploaded PDF's bytes
 * @param {Array} sheets sheet objects (as produced by flattenSheets(), or
 *   a subset of them) -- each needs .front/.back/.creepShiftMm/etc.
 * @param {object} opts { sheetWPt, sheetHPt, pageWPt, pageHPt, includeInstructions,
 *   marginHeadPt, marginFeetPt, onProgress }
 *   marginHeadPt/marginFeetPt: blank space (in points) left above/below
 *   each page's live content, sized to whatever you plan to trim off the
 *   head and feet after binding -- so the trim comes out of that blank
 *   allowance instead of the actual page content. The matching fore-edge
 *   (outer-edge) allowance isn't a separate parameter: it's simply baked
 *   into sheetWPt by the caller (2×(pageWPt + edge allowance)), since the
 *   fold-line centring below already splits any extra sheet width evenly
 *   onto the two outer edges.
 */
async function generateImposedPdfForSheets(PDFLib, sourceBytes, sheets, opts) {
  const { PDFDocument } = PDFLib;
  const srcDoc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
  const srcPageCount = srcDoc.getPageCount();

  const outDoc = await PDFDocument.create();

  // Embed every real source page once, up front, as a reusable vector
  // form, much faster than re-embedding per placement. (Harmless to embed
  // pages this particular output file never ends up using, e.g. when
  // called per-signature -- embedding is cheap relative to drawing.)
  const indices = Array.from({ length: srcPageCount }, (_, i) => i);
  const embeddedPages = await outDoc.embedPdf(sourceBytes, indices);

  const sheetW = opts.sheetWPt;
  const sheetH = opts.sheetHPt;
  const pageW = opts.pageWPt;
  const pageH = opts.pageHPt;
  const marginHeadPt = opts.marginHeadPt || 0;
  const marginFeetPt = opts.marginFeetPt || 0;

  // The fold line always sits at the sheet's true centre (sheetW/2) --
  // that's where the sheet physically folds, so that's where the two
  // pages of a spread must meet. Any extra sheet width beyond
  // 2×pageW (including any fore-edge trim allowance the caller baked
  // into sheetW) becomes equal margin on the OUTER edges, not a gap at
  // the spine.
  const foldX = sheetW / 2;
  // Vertically, head/feet allowances aren't necessarily equal, so centre
  // whatever's left over (e.g. extra room from a fixed paper preset)
  // around the head+content+feet block rather than assuming symmetry.
  const y = marginFeetPt + (sheetH - pageH - marginHeadPt - marginFeetPt) / 2;

  const total = sheets.length * 2;
  let done = 0;

  const placeSide = (page, contentPageNum, side, creepShiftPt) => {
    if (contentPageNum == null) return; // blank -- nothing to draw
    const embedded = embeddedPages[contentPageNum - 1];
    // Toward-the-spine = toward foldX for both sides.
    const x = side === "left" ? foldX - pageW + creepShiftPt : foldX - creepShiftPt;
    page.drawPage(embedded, { x, y, width: pageW, height: pageH });
  };

  for (const sheet of sheets) {
    const shiftPt = mmToPt(sheet.creepShiftMm || 0);

    const frontPage = outDoc.addPage([sheetW, sheetH]);
    placeSide(frontPage, sheet.front.left, "left", shiftPt);
    placeSide(frontPage, sheet.front.right, "right", shiftPt);
    if (opts.includeInstructions) {
      frontPage.drawText(
        `Sig ${sheet.signatureIndex + 1} . sheet ${sheet.indexInSignature + 1}/${sheet.sheetsInSignature} . front`,
        { x: 8, y: 8, size: 7 }
      );
    }
    done++;
    if (opts.onProgress) opts.onProgress(done / total);

    const backPage = outDoc.addPage([sheetW, sheetH]);
    placeSide(backPage, sheet.back.left, "left", shiftPt);
    placeSide(backPage, sheet.back.right, "right", shiftPt);
    if (opts.includeInstructions) {
      backPage.drawText(
        `Sig ${sheet.signatureIndex + 1} . sheet ${sheet.indexInSignature + 1}/${sheet.sheetsInSignature} . back`,
        { x: 8, y: 8, size: 7 }
      );
    }
    done++;
    if (opts.onProgress) opts.onProgress(done / total);
  }

  return outDoc.save();
}

/**
 * Build the final imposed PDF as a single file: one sheet-sized page per
 * sheet-side (front, then back, for every sheet of every signature, in
 * order). See generateImposedPdfsBySignature for the one-file-per-signature
 * alternative most people actually want to print from.
 */
export async function generateImposedPdf(PDFLib, sourceBytes, imposition, opts) {
  return generateImposedPdfForSheets(PDFLib, sourceBytes, flattenSheets(imposition), opts);
}

/**
 * Build the imposed output as one PDF per signature, each internally 2-up
 * imposed (front/back sheets, creep and trim allowance all applied exactly
 * as generateImposedPdf does) -- so every signature is its own ready-to-
 * print file, in the order you'll actually print, fold, and sew them.
 * opts is the same shape as generateImposedPdf's, plus opts.onProgress is
 * called with overall progress (0..1) across every signature combined.
 */
export async function generateImposedPdfsBySignature(PDFLib, sourceBytes, imposition, opts) {
  const results = [];
  const numSignatures = imposition.signatures.length;
  for (const sig of imposition.signatures) {
    const sheets = sig.sheets.map((s) => ({ ...s, signatureIndex: sig.index }));
    const bytes = await generateImposedPdfForSheets(PDFLib, sourceBytes, sheets, {
      ...opts,
      onProgress: opts.onProgress
        ? (localP) => opts.onProgress((sig.index + localP) / numSignatures)
        : undefined,
    });
    results.push({
      signatureIndex: sig.index,
      contentStart: sig.contentStart,
      contentEnd: sig.contentEnd,
      sheetsInSignature: sig.sheets.length,
      bytes,
    });
  }
  return results;
}

/**
 * Alternative, simpler output: split the source PDF into one plain PDF per
 * signature (pages in ordinary reading order, just padded with blanks to
 * a multiple of 4 -- no 2-up merging, no reordering). This is for anyone
 * whose printer or copier has its own built-in "Booklet" duplex mode: feed
 * it one of these per-signature files and let the printer driver do the
 * page reordering and 2-up merge itself, then fold/nest/sew the resulting
 * signatures together by hand in signature order. Avoids this tool's own
 * creep-compensation guess entirely, since the printer driver handles it
 * (if it does at all -- worth a single test print either way).
 */
export async function generateSignatureSplitPdfs(PDFLib, sourceBytes, imposition) {
  const { PDFDocument } = PDFLib;
  const srcDoc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
  const firstPage = srcDoc.getPage(0);
  const { width, height } = firstPage.getSize();

  const results = [];
  for (const sig of imposition.signatures) {
    const outDoc = await PDFDocument.create();
    const indices = [];
    for (let p = sig.contentStart; p <= sig.contentEnd; p++) indices.push(p - 1);
    const copied = indices.length ? await outDoc.copyPages(srcDoc, indices) : [];
    copied.forEach((p) => outDoc.addPage(p));
    for (let b = 0; b < sig.blanks; b++) outDoc.addPage([width, height]);
    const bytes = await outDoc.save();
    results.push({
      signatureIndex: sig.index,
      contentStart: sig.contentStart,
      contentEnd: sig.contentEnd,
      paddedCount: sig.paddedCount,
      bytes,
    });
  }
  return results;
}
