// Reads a CV file in the browser the way a screening system does: its text
// layer only (PDF through pdf.js with no clean-up of the characters, Word from
// the document XML itself), plus what the layout does to that text (columns,
// tables, text boxes, the header). Shared by the ATS check and the home page's
// "how many postings fit you". Needs atskit.js (twoColumns). Nothing is sent.
(() => {
  "use strict";
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  const PDF_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const fail = (code) => Object.assign(new Error(code), { code });

  let loading = null;
  const loadPdfJs = () => (loading ||= new Promise((ok, no) => {
    const s = document.createElement("script");
    s.src = PDFJS; s.onload = ok; s.onerror = () => no(fail("other"));
    document.head.append(s);
  }));

  // ---------- PDF ----------
  async function readPdf(buf) {
    await loadPdfJs();
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
    let doc;
    try {
      doc = await pdfjsLib.getDocument({ data: buf, isEvalSupported: false }).promise;
    } catch (e) { throw fail(e && e.name === "PasswordException" ? "locked" : "other"); }
    const pages = [];
    let images = 0, columns = false;
    const IMG = new Set([pdfjsLib.OPS.paintImageXObject, pdfjsLib.OPS.paintInlineImageXObject, pdfjsLib.OPS.paintImageMaskXObject]);
    for (let i = 1; i <= Math.min(doc.numPages, 6); i++) {
      const page = await doc.getPage(i);
      // disableNormalization: a parser gets "ﬁ" and Arabic presentation forms
      // as they are in the file; pdf.js would otherwise tidy them up for us
      const { items } = await page.getTextContent({ disableNormalization: true });
      let text = "", prev = null;
      const rows = [];
      for (const it of items) {
        if (prev && !text.endsWith("\n")) {
          const size = Math.hypot(prev.transform[0], prev.transform[1]) || 10;
          const gap = Math.abs(it.transform[4] - (prev.transform[4] + prev.width));
          const sameLine = Math.abs(it.transform[5] - prev.transform[5]) < size * 0.5;
          if (!sameLine || gap > size * 0.15) text += " ";
        }
        text += it.str + (it.hasEOL ? "\n" : "");
        prev = it;
        if (!it.str.trim()) continue;
        const y = it.transform[5], x = it.transform[4];
        let row = rows.find((r) => Math.abs(r.y - y) < 2);
        if (!row) rows.push(row = { y, spans: [] });
        row.spans.push([x, x + it.width]);
      }
      pages.push(text.replace(/ {2,}/g, " "));
      const width = page.getViewport({ scale: 1 }).width;
      if (MasarATS.twoColumns(rows.map((r) => mergeSpans(r.spans)), width)) columns = true;
      const ops = await page.getOperatorList();
      images += ops.fnArray.filter((f) => IMG.has(f)).length;
    }
    return { kind: "pdf", text: pages.join("\n"), pages: doc.numPages, images, columns };
  }

  // pieces of one word or one phrase sit next to each other; only a real gap separates spans
  function mergeSpans(spans) {
    const s = spans.sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const [a, b] of s) {
      const last = out[out.length - 1];
      if (last && a - last[1] < 12) last[1] = Math.max(last[1], b);
      else out.push([a, b]);
    }
    return out;
  }

  // ---------- Word (docx is a zip of XML files) ----------
  async function unzip(buf) {
    const v = new DataView(buf), bytes = new Uint8Array(buf);
    let end = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) {
      if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
    }
    if (end < 0) throw fail("other");
    const files = {};
    let p = v.getUint32(end + 16, true);
    const utf8 = new TextDecoder();
    for (let n = v.getUint16(end + 10, true); n > 0; n--) {
      if (v.getUint32(p, true) !== 0x02014b50) break;
      const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
      const nameLen = v.getUint16(p + 28, true), extra = v.getUint16(p + 30, true), note = v.getUint16(p + 32, true);
      const local = v.getUint32(p + 42, true);
      const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nameLen));
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      files[name] = { method, data: bytes.subarray(start, start + size) };
      p += 46 + nameLen + extra + note;
    }
    return async (name) => {
      const f = files[name];
      if (!f) return "";
      if (f.method === 0) return utf8.decode(f.data);
      const stream = new Blob([f.data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Response(stream).text();
    };
  }

  const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  // plain text of a Word part: the runs' text, tabs and line breaks, one paragraph a line
  function wordText(xml) {
    let out = "";
    for (const m of xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:tab\s[^>]*\/>|<w:br\/>|<w:br\s[^>]*\/>|<\/w:p>/g)) {
      if (m[1] !== undefined) out += m[1];
      else out += m[0].startsWith("<w:tab") ? "\t" : "\n";
    }
    return out.replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENT[e]).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d));
  }

  async function readDocx(buf) {
    const read = await unzip(buf);
    const body = await read("word/document.xml");
    if (!body) throw fail("other");
    const rels = await read("word/_rels/document.xml.rels");
    const parts = [...rels.matchAll(/Target="([^"]*(?:header|footer)\d*\.xml)"/g)].map((m) => `word/${m[1].replace(/^\/?word\//, "")}`);
    const margins = (await Promise.all(parts.map(read))).map(wordText).join("\n");
    const text = wordText(body);
    const inMargins = (rx) => rx.test(margins) && !rx.test(text);
    return {
      kind: "docx", text,
      tables: (body.match(/<w:tbl>/g) || []).length,
      textboxes: (body.match(/<w:txbxContent>/g) || []).length,
      columns: /<w:cols\b[^>]*w:num="([2-9])"/.test(body),
      images: (body.match(/<pic:pic\b|<v:imagedata\b/g) || []).length,
      headerContact: inMargins(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/) || inMargins(/(?:\+|\b00|\b0)\d[\d\s\-()]{7,16}\d/),
    };
  }

  async function readFile(file) {
    const ext = file.name.split(".").pop().toLowerCase();
    const buf = await file.arrayBuffer();
    if (ext === "pdf") return readPdf(buf);
    if (ext === "docx") return readDocx(buf);
    throw fail("type");
  }

  window.MasarRead = { readFile, readPdf, readDocx };
})();
