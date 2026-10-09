import React, { useState, useMemo, useCallback, useRef } from "react";
import * as PDFLib from "pdf-lib";
import {
  PAPER_PRESETS,
  computeImposition,
  flattenSheets,
  readPdfInfo,
  generateImposedPdf,
  generateImposedPdfsBySignature,
  mmToPt,
  ptToMm,
} from "./impose-core.js";

/* ---------------------------------------------------------
   Tokens -- matched to enperfeitas.com's own design system
   (dist/css/style.css), same convention as tools/boxmaker so
   this reads as part of the site rather than a pasted-in
   widget. Renders in the site's normal light theme -- no
   forced dark mode, unlike the first Lovable scaffold.
--------------------------------------------------------- */
const C = {
  bg: "#fafafa",
  panel: "#ffffff",
  panelDeep: "#f2f2f2",
  ink: "#000000",
  inkSoft: "#5a5a5a",
  line: "#e6e6e6",
  lineStrong: "#cccccc",
  accent: "#954a1e",
  accentSoft: "#c97f4a",
  warn: "#a8481f",
  warnBg: "#f7e2da",
  good: "#3f6b45",
  goodBg: "#e3ede4",
};
const SERIF = "'Roboto Slab', Georgia, serif";
const MONO = "'SF Mono','IBM Plex Mono',Menlo,Consolas,monospace";
const SANS = "'Roboto', Arial, Helvetica, sans-serif";

/* ---------------------------------------------------------
   Small shared UI primitives
--------------------------------------------------------- */
function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: C.inkSoft, margin: "18px 0 8px" }}>
      {children}
    </div>
  );
}

function FieldRow({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <label style={{ fontSize: 12.5, color: C.ink }}>{label}</label>
      </div>
      {children}
      {hint && <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 4, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
}

function Stepper({ value, onChange, min = 1, max = 20 }) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  const btnStyle = {
    width: 30,
    height: 30,
    border: `1px solid ${C.lineStrong}`,
    background: C.panel,
    cursor: "pointer",
    fontSize: 15,
    lineHeight: 1,
    color: C.ink,
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      <button type="button" onClick={dec} style={{ ...btnStyle, borderRadius: "4px 0 0 4px" }} aria-label="Decrease">
        −
      </button>
      <div
        style={{
          width: 44,
          height: 30,
          border: `1px solid ${C.lineStrong}`,
          borderLeft: "none",
          borderRight: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: MONO,
          fontSize: 13,
        }}
      >
        {value}
      </div>
      <button type="button" onClick={inc} style={{ ...btnStyle, borderRadius: "0 4px 4px 0" }} aria-label="Increase">
        +
      </button>
    </div>
  );
}

function NumInput({ value, onChange, step = 1, min, max, suffix }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value === "" ? 0 : parseFloat(e.target.value))}
        style={{
          width: 90,
          padding: "6px 8px",
          border: `1px solid ${C.lineStrong}`,
          borderRadius: 4,
          fontFamily: MONO,
          fontSize: 13,
        }}
      />
      {suffix && <span style={{ fontSize: 12, color: C.inkSoft }}>{suffix}</span>}
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  // The whole row is clickable (not just the small switch graphic) via a
  // real checkbox input -- visually hidden but functional, so this also
  // works with keyboard and screen readers, not just a mouse click
  // precisely on the switch.
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12.5 }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
      />
      <span
        style={{
          width: 34,
          height: 20,
          borderRadius: 99,
          background: checked ? C.accent : C.lineStrong,
          position: "relative",
          transition: "background .15s",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 16 : 2,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "#fff",
            transition: "left .15s",
            boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
          }}
        />
      </span>
      {label}
    </label>
  );
}

function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        padding: "7px 8px",
        border: `1px solid ${C.lineStrong}`,
        borderRadius: 4,
        fontSize: 13,
        background: C.panel,
        color: C.ink,
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Button({ children, onClick, disabled, variant = "primary", full }) {
  const base = {
    padding: "10px 16px",
    borderRadius: 4,
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    border: "1px solid transparent",
    width: full ? "100%" : undefined,
    opacity: disabled ? 0.5 : 1,
  };
  const styles = {
    primary: { ...base, background: C.accent, color: "#fff" },
    secondary: { ...base, background: C.panel, color: C.ink, border: `1px solid ${C.lineStrong}` },
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={styles[variant]}>
      {children}
    </button>
  );
}

function formatBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

/* ---------------------------------------------------------
   Header
--------------------------------------------------------- */
function Header() {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 26, letterSpacing: "-0.01em" }}>
        Booklet Imposition
      </div>
      <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 4, maxWidth: 640, lineHeight: 1.5 }}>
        Upload a page-sequence PDF and lay it out for saddle-stitch printing — a single signature, or
        several sewn sections nested and sewn together, with creep compensation if you want it.
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   PdfUpload
--------------------------------------------------------- */
function PdfUpload({ file, info, onFileSelect, error, disabled }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (files) => {
    if (!files || !files[0]) return;
    onFileSelect(files[0]);
  };

  return (
    <div>
      <div
        onClick={() => !disabled && inputRef.current && inputRef.current.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled) handleFiles(e.dataTransfer.files);
        }}
        style={{
          border: `2px dashed ${dragOver ? C.accent : C.lineStrong}`,
          borderRadius: 6,
          padding: "28px 20px",
          textAlign: "center",
          cursor: disabled ? "not-allowed" : "pointer",
          background: dragOver ? C.panelDeep : C.panel,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          disabled={disabled}
          onChange={(e) => handleFiles(e.target.files)}
          style={{ display: "none" }}
        />
        {!file && (
          <div style={{ fontSize: 13, color: C.inkSoft }}>
            <div style={{ fontWeight: 600, color: C.ink, marginBottom: 4 }}>Drop a PDF here, or click to choose one</div>
            One page per book page, in reading order — this tool handles the reordering.
          </div>
        )}
        {file && (
          <div style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 600 }}>{file.name}</div>
            <div style={{ color: C.inkSoft, marginTop: 2 }}>{formatBytes(file.size)}</div>
            {info && (
              <div style={{ color: C.inkSoft, marginTop: 6, fontFamily: MONO, fontSize: 12 }}>
                {info.pageCount} pages · {Math.round(ptToMm(info.pageWidthPt))} × {Math.round(ptToMm(info.pageHeightPt))} mm each
              </div>
            )}
            <div style={{ marginTop: 10 }}>
              <span style={{ fontSize: 12, color: C.accent, textDecoration: "underline" }}>Choose a different file</span>
            </div>
          </div>
        )}
      </div>
      {error && (
        <div style={{ marginTop: 10, background: C.warnBg, color: C.warn, borderRadius: 4, padding: "10px 12px", fontSize: 12.5 }}>
          {error}
        </div>
      )}
      {info && info.mixedSizes && (
        <div style={{ marginTop: 10, background: C.warnBg, color: C.warn, borderRadius: 4, padding: "10px 12px", fontSize: 12.5, lineHeight: 1.5 }}>
          This PDF's pages aren't all the same size. Imposition assumes one uniform page size (taken from
          page 1) — any page a different size will be stretched or squeezed to fit. Standardise the page
          size in your source document first if that's not what you want.
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   SheetPreview -- a schematic (not a rendered thumbnail) of
   which page number sits where on the current sheet. Honest
   trade-off: this tool doesn't render your actual page
   content in the preview (that needs a much heavier PDF
   rendering library) -- it shows you precisely which page
   goes in which slot instead, which is what you actually need
   to check the imposition is right before you print.
--------------------------------------------------------- */
// Scale a real (small) mm shift up to a visible pixel nudge, so a 0.3mm
// creep shift -- invisible if drawn to true scale -- still reads clearly
// as "shifted a little" next to a 2mm shift reading as "shifted a lot".
// The exact mm value is always also printed in text, since the picture
// is deliberately exaggerated for legibility, not to scale.
function creepPx(mm) {
  if (!mm) return 0;
  return Math.max(4, Math.min(28, Math.round(mm * 11)));
}

function PageSlot({ num, wide, shiftPx = 0, towardSpine, slotSide, trimPct }) {
  const blank = num == null;
  const shifted = shiftPx > 0;
  const hasTrim = !blank && trimPct && (trimPct.top > 0 || trimPct.bottom > 0 || trimPct.outer > 0);
  return (
    <div
      style={{
        flex: 1,
        aspectRatio: "3 / 4",
        border: `1px solid ${blank ? C.line : shifted ? C.accent : C.lineStrong}`,
        background: blank ? C.panelDeep : C.panel,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        transform: towardSpine === "right" ? `translateX(${shiftPx}px)` : towardSpine === "left" ? `translateX(-${shiftPx}px)` : undefined,
        transition: "transform .2s ease, border-color .2s ease",
        zIndex: shifted ? 1 : 0,
      }}
    >
      {hasTrim && (
        <div
          style={{
            position: "absolute",
            top: `${trimPct.top * 100}%`,
            bottom: `${trimPct.bottom * 100}%`,
            left: slotSide === "left" ? `${trimPct.outer * 100}%` : 0,
            right: slotSide === "right" ? `${trimPct.outer * 100}%` : 0,
            border: `1.5px dashed ${C.good}`,
            pointerEvents: "none",
          }}
        />
      )}
      {blank ? (
        <span style={{ fontSize: 11, color: C.inkSoft, fontStyle: "italic" }}>blank</span>
      ) : (
        <span style={{ fontFamily: MONO, fontSize: wide ? 22 : 17, color: C.ink, position: "relative" }}>{num}</span>
      )}
      {shifted && (
        <span
          style={{
            position: "absolute",
            top: 3,
            [towardSpine === "right" ? "right" : "left"]: 3,
            fontSize: 11,
            color: C.accent,
          }}
        >
          {towardSpine === "right" ? "→" : "←"}
        </span>
      )}
    </div>
  );
}

function SheetDiagram({ sheet, side, trimPct }) {
  const pair = side === "front" ? sheet.front : sheet.back;
  const shiftPx = creepPx(sheet.creepShiftMm);
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: C.inkSoft, marginBottom: 6 }}>
        {side}
      </div>
      <div style={{ display: "flex", position: "relative", border: `1px solid ${C.line}`, borderRadius: 4, padding: 10, background: C.bg, overflow: "visible" }}>
        <PageSlot num={pair.left} slotSide="left" trimPct={trimPct} shiftPx={shiftPx} towardSpine={shiftPx > 0 ? "right" : undefined} />
        <div style={{ width: 0, borderLeft: `1.5px dashed ${C.accent}`, margin: "0 6px" }} />
        <PageSlot num={pair.right} slotSide="right" trimPct={trimPct} shiftPx={shiftPx} towardSpine={shiftPx > 0 ? "left" : undefined} />
      </div>
      <div style={{ textAlign: "center", fontSize: 10.5, color: C.inkSoft, marginTop: 4 }}>
        <span style={{ color: C.accent }}>┊</span> fold line (spine)
        {trimPct && (trimPct.top > 0 || trimPct.bottom > 0 || trimPct.outer > 0) && (
          <>
            {"   "}
            <span style={{ color: C.good }}>┊</span> trimmed edge, after binding
          </>
        )}
      </div>
    </div>
  );
}

function SheetPreview({ imposition, currentIndex, onNavigate, pageCount, trim, pageWmm, pageHmm }) {
  const sheets = useMemo(() => (imposition ? flattenSheets(imposition) : []), [imposition]);
  const total = sheets.length;
  const trimPct =
    trim && pageWmm && pageHmm
      ? {
          top: Math.min(0.45, (trim.headMm || 0) / pageHmm),
          bottom: Math.min(0.45, (trim.feetMm || 0) / pageHmm),
          outer: Math.min(0.45, (trim.edgeMm || 0) / pageWmm),
        }
      : null;

  if (!imposition || total === 0) {
    return (
      <div style={{ border: `1px dashed ${C.lineStrong}`, borderRadius: 6, padding: 28, textAlign: "center", color: C.inkSoft, fontSize: 13 }}>
        Upload a PDF to see how it lays out on paper.
      </div>
    );
  }

  const idx = Math.min(Math.max(0, currentIndex), total - 1);
  const sheet = sheets[idx];
  const sig = imposition.signatures[sheet.signatureIndex];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 12.5, color: C.inkSoft }}>
          Signature <strong style={{ color: C.ink }}>{sheet.signatureIndex + 1}</strong> of {imposition.numSignatures} — sheet{" "}
          <strong style={{ color: C.ink }}>{sheet.indexInSignature + 1}</strong> of {sheet.sheetsInSignature}
          {sheet.isOutermost && " (outermost / cover)"}
          {sheet.isInnermost && sheet.sheetsInSignature > 1 && " (innermost / centrefold)"}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Button variant="secondary" onClick={() => onNavigate(idx - 1)} disabled={idx === 0}>
            ← Prev
          </Button>
          <Button variant="secondary" onClick={() => onNavigate(idx + 1)} disabled={idx === total - 1}>
            Next →
          </Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <SheetDiagram sheet={sheet} side="front" trimPct={trimPct} />
        <SheetDiagram sheet={sheet} side="back" trimPct={trimPct} />
      </div>

      <div
        style={{
          marginTop: 12,
          fontSize: 12,
          borderRadius: 4,
          padding: "9px 12px",
          lineHeight: 1.5,
          background: sheet.creepShiftMm > 0 ? C.goodBg : C.panelDeep,
          color: sheet.creepShiftMm > 0 ? C.good : C.inkSoft,
        }}
      >
        {sheet.creepShiftMm > 0 ? (
          <>
            <strong>Creep compensation is on for this sheet:</strong> both pages are nudged{" "}
            {sheet.creepShiftMm} mm toward the spine (the arrows above), to make up for {sheet.indexInSignature}{" "}
            sheet{sheet.indexInSignature === 1 ? "" : "s"} nested around this one pushing it outward. The
            outermost (cover) sheet of each signature always gets 0 mm, since it wraps around everything
            else and barely moves.
          </>
        ) : (
          <>Creep compensation is off — pages print at their exact position, no shift.</>
        )}
      </div>

      <div style={{ marginTop: 14, fontSize: 11.5, color: C.inkSoft }}>
        Sheet {idx + 1} of {total} overall · signature {sheet.signatureIndex + 1} covers content pages {sig.contentStart}–
        {Math.min(sig.contentEnd, pageCount)}
        {sig.blanks > 0 && `, padded with ${sig.blanks} blank page${sig.blanks > 1 ? "s" : ""}`}.
      </div>

      {trimPct && (trimPct.top > 0 || trimPct.bottom > 0 || trimPct.outer > 0) && pageWmm && pageHmm && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: C.inkSoft }}>
          The dashed green line is where the head/feet/fore-edge trim lands — trim to it and each page
          comes out at your original {Math.round(pageWmm)} × {Math.round(pageHmm)} mm, full content intact.
          It's extra sheet space, not a shrink of your pages.
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   SignatureControls
--------------------------------------------------------- */
function SignatureControls({
  sheetsPerSignature,
  onSheetsPerSignatureChange,
  paperKey,
  onPaperKeyChange,
  marginHeadMm,
  onMarginHeadMmChange,
  marginFeetMm,
  onMarginFeetMmChange,
  marginEdgeMm,
  onMarginEdgeMmChange,
  creepEnabled,
  onCreepEnabledChange,
  creepTotalMm,
  onCreepTotalMmChange,
  includeInstructions,
  onIncludeInstructionsChange,
  imposition,
  isGenerating,
  progress,
  generatedZip,
  onGenerate,
  onGenerateSplit,
  splitZip,
  canGenerate,
}) {
  return (
    <div>
      <SectionLabel>Binding</SectionLabel>
      <FieldRow
        label="Sheets per signature"
        hint={
          sheetsPerSignature === 1
            ? "Each signature is a single folded sheet. Simple, but a thick book gets bulky signatures fast."
            : `Each signature nests ${sheetsPerSignature} sheets (${sheetsPerSignature * 4} pages) before it's sewn to the next one.`
        }
      >
        <Stepper value={sheetsPerSignature} onChange={onSheetsPerSignatureChange} min={1} max={15} />
      </FieldRow>

      <SectionLabel>Paper</SectionLabel>
      <FieldRow label="Sheet size" hint="Auto fits the sheet exactly to 2× your page width — no printer margin. Pick a fixed size if you need to match a specific tray.">
        <Select
          value={paperKey}
          onChange={onPaperKeyChange}
          options={[{ value: "auto", label: "Auto (exact fit, no margin)" }, ...Object.entries(PAPER_PRESETS).map(([k, p]) => ({ value: k, label: p.label }))]}
        />
      </FieldRow>

      <SectionLabel>Trim allowance</SectionLabel>
      <div style={{ fontSize: 11.5, color: C.inkSoft, lineHeight: 1.5, marginBottom: 10 }}>
        How much you'll trim off the head, feet, and fore-edge once the book is bound. The tool adds
        this as blank space around each page, so the cut comes out of that space — not your text.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 6 }}>
        <FieldRow label="Head (top)">
          <NumInput value={marginHeadMm} onChange={onMarginHeadMmChange} step={0.5} min={0} max={30} suffix="mm" />
        </FieldRow>
        <FieldRow label="Feet (bottom)">
          <NumInput value={marginFeetMm} onChange={onMarginFeetMmChange} step={0.5} min={0} max={30} suffix="mm" />
        </FieldRow>
      </div>
      <FieldRow
        label="Fore-edge (outer side)"
        hint="Set any of these to 0 if your pages already have their own margin baked in and you're only ever trimming a hairline off. These apply to every page — the spine side is never trimmed, so it has no allowance here."
      >
        <NumInput value={marginEdgeMm} onChange={onMarginEdgeMmChange} step={0.5} min={0} max={30} suffix="mm" />
      </FieldRow>

      <SectionLabel>Creep compensation</SectionLabel>
      <FieldRow label="">
        <Toggle checked={creepEnabled} onChange={onCreepEnabledChange} label="Compensate for creep (shingling)" />
      </FieldRow>
      {creepEnabled && (
        <FieldRow
          label="Total creep to compensate"
          hint="Fold a real test signature of this paper and thickness, then measure how much further the innermost sheet's open edge sticks out past the outermost (cover) sheet's. That number goes here. Leave at 0 if you're not sure — better to trim by eye than guess."
        >
          <NumInput value={creepTotalMm} onChange={onCreepTotalMmChange} step={0.1} min={0} max={20} suffix="mm" />
        </FieldRow>
      )}

      <SectionLabel>Assembly label</SectionLabel>
      <FieldRow
        label=""
        hint={'Prints a tiny note in the corner of each sheet, like "Sig 1 · sheet 2/3 · front" — handy for keeping sheets in the right order while you fold and sew, especially with more than one signature. It sits in the margin and gets trimmed off (or just leave it off if you don\'t need it).'}
      >
        <Toggle
          checked={includeInstructions}
          onChange={onIncludeInstructionsChange}
          label="Print a small signature/sheet label in the corner"
        />
      </FieldRow>

      {imposition && (
        <div style={{ background: C.panelDeep, borderRadius: 4, padding: "10px 12px", fontSize: 12, color: C.inkSoft, margin: "14px 0", lineHeight: 1.6 }}>
          {imposition.numSignatures} signature{imposition.numSignatures > 1 ? "s" : ""} · {imposition.totalSheets} sheet
          {imposition.totalSheets > 1 ? "s" : ""} · {imposition.totalSheets * 2} sides to print ·{" "}
          {imposition.totalPaddedPages} pages total
          {imposition.totalPaddedPages !== imposition.signatures.reduce((a, s) => a + s.contentCount, 0) &&
            ` (${imposition.signatures.reduce((a, s) => a + s.blanks, 0)} blank)`}
        </div>
      )}

      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 8 }}>
        <Button onClick={onGenerate} disabled={!canGenerate || isGenerating} full>
          {isGenerating ? `Generating… ${Math.round(progress * 100)}%` : "Generate imposed sheets"}
        </Button>
        {isGenerating && (
          <div style={{ height: 4, background: C.line, borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.round(progress * 100)}%`, background: C.accent, transition: "width .15s" }} />
          </div>
        )}
        {generatedZip && (
          <Button onClick={() => generatedZip.download()} variant="secondary" full>
            Download {generatedZip.filename} ({formatBytes(generatedZip.size)})
          </Button>
        )}
      </div>

      <div style={{ marginTop: 22, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: C.ink, marginBottom: 6 }}>
          One PDF per signature
        </div>
        <div style={{ fontSize: 11.5, color: C.inkSoft, lineHeight: 1.5, marginBottom: 8 }}>
          Same imposed spreads as the complete PDF above, split into one ready-to-print file per signature
          - handy for printing, folding and sewing one signature at a time.
        </div>
        <Button variant="secondary" onClick={onGenerateSplit} disabled={!canGenerate} full>
          Generate one imposed PDF per signature
        </Button>
        {splitZip && splitZip.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {splitZip.map((s) => (
              <Button key={s.signatureIndex} variant="secondary" onClick={() => s.download()} full>
                Download signature {s.signatureIndex + 1} ({s.paddedCount} pp, {formatBytes(s.size)})
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   BookbindingTips
--------------------------------------------------------- */
function Tip({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: 12, color: C.inkSoft, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

function BookbindingTips() {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 5, padding: "16px 18px" }}>
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 14.5, marginBottom: 12 }}>Printing & binding tips</div>

      <Tip title="Duplex flip: test before you commit paper">
        These sheets print landscape (wide). On most drivers that means "Flip on Short Edge" duplex, not
        "Long Edge" — but drivers vary. Print sheet 1 of a short test file first, both sides, and check the
        back reads right-way-up and not mirrored before you print the real run.
      </Tip>

      <Tip title="Nesting order">
        Fold every sheet of a signature in half first, then nest them inside each other in reverse:
        innermost sheet (the one shown last in the preview) goes in first, outermost (the cover) wraps
        around everything else last.
      </Tip>

      <Tip title="Sewing multiple signatures">
        Stack the finished signatures in order (signature 1 first) and sew through each one's own fold
        line, then link the signatures together along the spine — a simple pamphlet stitch per signature,
        chained to the next with a kettle or chain stitch, works well for most sketchbook-weight paper.
      </Tip>

      <Tip title="Grain direction">
        Where you can choose, run the paper's grain parallel to the spine (the fold). Folding against the
        grain works but the fold will crack more and lie less flat.
      </Tip>

      <Tip title="Test-fold before a long run">
        Print and fold just one real signature first. Check reading order, margins, and — if you're using
        it — that the creep compensation is actually pulling the trim in the right direction, before
        committing the rest of the paper.
      </Tip>

      <Tip title="Keep signatures modest">
        More than about 6–8 sheets nested in one signature gets bulky and hard to fold flat, and creep gets
        harder to compensate for accurately. Several thinner signatures sew and sit flatter than one thick
        one.
      </Tip>
    </div>
  );
}

/* ---------------------------------------------------------
   Footer note
--------------------------------------------------------- */
function Footer() {
  return (
    <div style={{ marginTop: 28, paddingTop: 14, borderTop: `1px solid ${C.line}`, fontSize: 11.5, color: C.inkSoft, lineHeight: 1.6 }}>
      Everything happens in your browser — the PDF is never uploaded anywhere. Pages are embedded as
      vector content, not rasterised, so print quality matches your source file exactly.
    </div>
  );
}

/* ---------------------------------------------------------
   Top-level component
--------------------------------------------------------- */
export default function ImpositionTool() {
  const [file, setFile] = useState(null);
  const [info, setInfo] = useState(null); // {pageCount, pageWidthPt, pageHeightPt, mixedSizes}
  const [sourceBytes, setSourceBytes] = useState(null);
  const [error, setError] = useState(null);

  const [sheetsPerSignature, setSheetsPerSignature] = useState(5);
  const [paperKey, setPaperKey] = useState("a4");
  const [creepEnabled, setCreepEnabled] = useState(false);
  const [creepTotalMm, setCreepTotalMm] = useState(1);
  const [includeInstructions, setIncludeInstructions] = useState(true);

  // Trim allowance: blank space added around each page for whatever you
  // physically trim off the head, feet, and fore-edge after binding, so
  // the guillotine cut comes out of that allowance instead of your text.
  // 3mm is a common minimum trim allowance -- adjust to match your own
  // guillotine/cutter and how tight your source pages already are.
  const [marginHeadMm, setMarginHeadMm] = useState(3);
  const [marginFeetMm, setMarginFeetMm] = useState(3);
  const [marginEdgeMm, setMarginEdgeMm] = useState(3);

  const [currentSheetIndex, setCurrentSheetIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generatedZip, setGeneratedZip] = useState(null); // {filename, size, download()}
  const [splitZip, setSplitZip] = useState(null); // [{signatureIndex, paddedCount, size, download()}]

  const handleFileSelect = useCallback(async (f) => {
    setError(null);
    setGeneratedZip(null);
    setSplitZip(null);
    setCurrentSheetIndex(0);
    setFile(f);
    setInfo(null);
    setSourceBytes(null);
    try {
      const buf = await f.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const meta = await readPdfInfo(PDFLib, bytes);
      setSourceBytes(bytes);
      setInfo({
        pageCount: meta.pageCount,
        pageWidthPt: meta.pageWidthPt,
        pageHeightPt: meta.pageHeightPt,
        mixedSizes: meta.mixedSizes,
      });
    } catch (e) {
      setError("Couldn't read that PDF — it may be corrupted, password-protected, or not a valid PDF. (" + (e && e.message ? e.message : "unknown error") + ")");
    }
  }, []);

  const imposition = useMemo(() => {
    if (!info || !info.pageCount) return null;
    return computeImposition(info.pageCount, sheetsPerSignature, { enabled: creepEnabled, totalMm: creepTotalMm });
  }, [info, sheetsPerSignature, creepEnabled, creepTotalMm]);

  const sheetDims = useMemo(() => {
    if (!info) return null;
    const pageWPt = info.pageWidthPt;
    const pageHPt = info.pageHeightPt;
    const marginHeadPt = mmToPt(marginHeadMm || 0);
    const marginFeetPt = mmToPt(marginFeetMm || 0);
    const marginEdgePt = mmToPt(marginEdgeMm || 0);
    // The trim allowance always gets added as blank sheet space around
    // the content, on top of whatever the paper choice provides:
    // "auto" fits exactly to content + allowance; a fixed preset centres
    // content + allowance within it (with any further leftover space
    // split evenly as extra margin).
    const minSheetW = (pageWPt + marginEdgePt) * 2;
    const minSheetH = pageHPt + marginHeadPt + marginFeetPt;
    if (paperKey === "auto") {
      return { sheetWPt: minSheetW, sheetHPt: minSheetH, pageWPt, pageHPt, marginHeadPt, marginFeetPt };
    }
    const preset = PAPER_PRESETS[paperKey];
    // Fixed paper is portrait by default; imposed spreads are landscape,
    // so lay the preset on its side to match the spread's orientation.
    const sheetWPt = Math.max(mmToPt(Math.max(preset.w, preset.h)), minSheetW);
    const sheetHPt = Math.max(mmToPt(Math.min(preset.w, preset.h)), minSheetH);
    return { sheetWPt, sheetHPt, pageWPt, pageHPt, marginHeadPt, marginFeetPt };
  }, [info, paperKey, marginHeadMm, marginFeetMm, marginEdgeMm]);

  const canGenerate = !!(file && info && info.pageCount > 0 && sourceBytes);

  // Small helper: trigger a browser download of an in-memory blob.
  const downloadBlobAs = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const sheetOpts = () => ({
    sheetWPt: sheetDims.sheetWPt,
    sheetHPt: sheetDims.sheetHPt,
    pageWPt: sheetDims.pageWPt,
    pageHPt: sheetDims.pageHPt,
    marginHeadPt: sheetDims.marginHeadPt,
    marginFeetPt: sheetDims.marginFeetPt,
    includeInstructions,
  });

  // Complete imposed PDF: every sheet of every signature in one file.
  const handleGenerate = useCallback(async () => {
    if (!canGenerate || !imposition || !sheetDims) return;
    setIsGenerating(true);
    setProgress(0);
    setGeneratedZip(null);
    try {
      const bytes = await generateImposedPdf(PDFLib, sourceBytes, imposition, {
        ...sheetOpts(),
        onProgress: (p) => setProgress(p),
      });
      const base = file.name.replace(/\.pdf$/i, "");
      const filename = `${base}-imposed.pdf`;
      setGeneratedZip({
        filename,
        size: bytes.length,
        download: () => downloadBlobAs(new Blob([bytes], { type: "application/pdf" }), filename),
      });
    } catch (e) {
      setError("Couldn't generate the imposed PDF. (" + (e && e.message ? e.message : "unknown error") + ")");
    } finally {
      setIsGenerating(false);
    }
  }, [canGenerate, imposition, sheetDims, sourceBytes, includeInstructions, file]);

  // One imposed PDF per signature: the same 2-up spreads as the complete
  // PDF above, just split by signature.
  const handleGenerateSplit = useCallback(async () => {
    if (!canGenerate || !imposition || !sheetDims) return;
    try {
      const results = await generateImposedPdfsBySignature(PDFLib, sourceBytes, imposition, sheetOpts());
      const base = file.name.replace(/\.pdf$/i, "");
      setSplitZip(
        results.map((r) => ({
          signatureIndex: r.signatureIndex,
          paddedCount: imposition.signatures[r.signatureIndex].paddedCount,
          size: r.bytes.length,
          download: () =>
            downloadBlobAs(
              new Blob([r.bytes], { type: "application/pdf" }),
              `${base}-signature-${r.signatureIndex + 1}-imposed.pdf`
            ),
        }))
      );
    } catch (e) {
      setError("Couldn't generate the signature PDFs. (" + (e && e.message ? e.message : "unknown error") + ")");
    }
  }, [canGenerate, imposition, sheetDims, sourceBytes, includeInstructions, file]);

  return (
    <div style={{ background: C.bg, minHeight: 600, fontFamily: SANS, color: C.ink, padding: 24 }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <Header />

        <div className="imposition-layout">
          <div className="imp-upload">
            <SectionLabel>1. Upload</SectionLabel>
            <PdfUpload file={file} info={info} onFileSelect={handleFileSelect} error={error} disabled={isGenerating} />
          </div>

          <div className="imp-aside">
            <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 5, padding: "16px 18px" }}>
              <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 15, marginBottom: 2 }}>2. Settings & generate</div>
              <SignatureControls
                sheetsPerSignature={sheetsPerSignature}
                onSheetsPerSignatureChange={setSheetsPerSignature}
                paperKey={paperKey}
                onPaperKeyChange={setPaperKey}
                marginHeadMm={marginHeadMm}
                onMarginHeadMmChange={setMarginHeadMm}
                marginFeetMm={marginFeetMm}
                onMarginFeetMmChange={setMarginFeetMm}
                marginEdgeMm={marginEdgeMm}
                onMarginEdgeMmChange={setMarginEdgeMm}
                creepEnabled={creepEnabled}
                onCreepEnabledChange={setCreepEnabled}
                creepTotalMm={creepTotalMm}
                onCreepTotalMmChange={setCreepTotalMm}
                includeInstructions={includeInstructions}
                onIncludeInstructionsChange={setIncludeInstructions}
                imposition={imposition}
                isGenerating={isGenerating}
                progress={progress}
                generatedZip={generatedZip}
                onGenerate={handleGenerate}
                onGenerateSplit={handleGenerateSplit}
                splitZip={splitZip}
                canGenerate={canGenerate}
              />
            </div>
          </div>

          <div className="imp-preview">
            <SectionLabel>3. Sheet preview</SectionLabel>
            <SheetPreview
              imposition={imposition}
              currentIndex={currentSheetIndex}
              onNavigate={setCurrentSheetIndex}
              pageCount={info ? info.pageCount : 0}
              trim={{ headMm: marginHeadMm, feetMm: marginFeetMm, edgeMm: marginEdgeMm }}
              pageWmm={info ? ptToMm(info.pageWidthPt) : 105}
              pageHmm={info ? ptToMm(info.pageHeightPt) : 148}
            />
          </div>

          <div className="imp-tips">
            <SectionLabel>Reference</SectionLabel>
            <BookbindingTips />
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}
