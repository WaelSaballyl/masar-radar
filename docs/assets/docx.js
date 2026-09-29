// The finished CV as a Word file (.docx), built in the browser from the
// rendered paper. Word keeps text in reading order, so an Arabic CV reaches a
// screening system as written; a PDF printed from a browser hands it the
// glyphs in visual order ("خلال" arrives as "خالل"). One column, real
// headings and bullets, contact in the page body (never the header).
(() => {
  "use strict";

  // ---------- a zip with no compression (all a .docx needs) ----------
  const CRC = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (b) => { let c = ~0; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0; };

  function zip(files) {
    const enc = new TextEncoder(), parts = [], dir = [];
    let offset = 0;
    for (const [name, text] of files) {
      const n = enc.encode(name), data = enc.encode(text), crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      [[0, 0x04034b50, 4], [4, 20, 2], [8, 0, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, n.length, 2]]
        .forEach(([at, v, size]) => (size === 4 ? local.setUint32(at, v, true) : local.setUint16(at, v, true)));
      const central = new DataView(new ArrayBuffer(46));
      [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, n.length, 2], [42, offset, 4]]
        .forEach(([at, v, size]) => (size === 4 ? central.setUint32(at, v, true) : central.setUint16(at, v, true)));
      parts.push(local, n, data);
      dir.push(central, n);
      offset += 30 + n.length + data.length;
    }
    const size = dir.reduce((s, d) => s + d.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    [[0, 0x06054b50, 4], [8, files.length, 2], [10, files.length, 2], [12, size, 4], [16, offset, 4]]
      .forEach(([at, v, s]) => (s === 4 ? end.setUint32(at, v, true) : end.setUint16(at, v, true)));
    return new Blob([...parts, ...dir, end], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }

  // ---------- WordprocessingML ----------
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

  function build(paper) {
    const rtl = paper.dir === "rtl";
    const bidi = rtl ? "<w:bidi/>" : "";
    const one = (text, bold, dir) => `<w:r><w:rPr>${bold ? "<w:b/><w:bCs/>" : ""}${dir ? "<w:rtl/>" : ""}</w:rPr>`
      + `<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
    // In a right-to-left run Word reorders the groups of "+966 55 123 4567"
    // ("4567 123 55 966+"): Latin letters and digits go in runs of their own.
    const run = (text, bold) => (!rtl ? one(text, bold, false)
      : text.split(/([A-Za-z0-9+@#&][A-Za-z0-9+@#&.,:/()_ -]*[A-Za-z0-9)]|[A-Za-z0-9])/)
        .map((t, i) => (t ? one(t, bold, i % 2 === 0) : "")).join(""));
    const para = (runs, style, extra = "") => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${extra}${bidi}</w:pPr>${runs}</w:p>`;
    // a node's text as runs: <strong> stays bold
    const runsOf = (node) => [...node.childNodes].map((c) => (c.nodeType === 3 ? run(c.textContent)
      : c.tagName === "STRONG" ? run(c.textContent, true) : run(c.textContent))).join("");
    const out = [];
    const bullets = (ul) => [...ul.children].forEach((li) => out.push(para(runsOf(li), "ListBullet")));
    for (const node of paper.children) {
      if (node.tagName === "H1") out.push(para(run(node.textContent), "Title"));
      else if (node.tagName === "H2") out.push(para(run(node.textContent), "Heading1"));
      else if (node.tagName === "UL") bullets(node);
      else if (node.classList.contains("cv-item")) {
        for (const part of node.children) {
          if (part.classList.contains("cv-row")) {
            // title, then the dates on the same line: a tab stop's side flips between
            // Word and other readers in right-to-left text, a plain separator does not
            const [title, meta] = part.children;
            out.push(para(run(title.textContent, true) + (meta ? run(`  |  ${meta.textContent}`) : ""), "ItemRow"));
          } else if (part.tagName === "UL") bullets(part);
        }
      } else if (node.tagName === "P") {
        out.push(para(runsOf(node), node.classList.contains("cv-contact") || node.classList.contains("cv-headline") ? "Contact" : null));
      }
    }
    return out.join("");
  }

  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  function styles(rtl) {
    const font = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Arial"/>';
    const lang = `<w:lang w:val="en-US" w:bidi="ar-SA"/>`;
    const style = (id, name, ppr, rpr, extra = "") => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>`
      + `<w:basedOn w:val="Normal"/>${extra}<w:qFormat/><w:pPr>${ppr}</w:pPr><w:rPr>${rpr}</w:rPr></w:style>`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}>`
      + `<w:docDefaults><w:rPrDefault><w:rPr>${font}<w:sz w:val="21"/><w:szCs w:val="21"/>${lang}</w:rPr></w:rPrDefault>`
      + `<w:pPrDefault><w:pPr><w:spacing w:after="40" w:line="264" w:lineRule="auto"/>${rtl ? "<w:bidi/>" : ""}</w:pPr></w:pPrDefault></w:docDefaults>`
      + `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>`
      + style("Title", "Title", '<w:spacing w:after="40"/>', '<w:b/><w:bCs/><w:sz w:val="34"/><w:szCs w:val="34"/>')
      + style("Heading1", "heading 1", '<w:keepNext/><w:spacing w:before="200" w:after="60"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr><w:outlineLvl w:val="0"/>',
        '<w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/>', '<w:next w:val="Normal"/>')
      + style("ItemRow", "Item row", '<w:keepNext/><w:spacing w:before="80" w:after="20"/>', "")
      + style("Contact", "Contact", '<w:spacing w:after="20"/>', "")
      + style("ListBullet", "List Bullet", `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:after="20"/>${indent(rtl)}`, "")
      + "</w:styles>";
  }
  // in a right-to-left paragraph Word measures "left" from the right edge
  const indent = () => '<w:ind w:left="360" w:hanging="240"/>';
  const numbering = (rtl) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W}>`
    + '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/>'
    + `<w:lvlJc w:val="left"/><w:pPr>${indent(rtl)}</w:pPr></w:lvl></w:abstractNum>`
    + '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>';

  function fromPaper(paper) {
    const rtl = paper.dir === "rtl";
    const body = build(paper);
    const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}`
      + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="851" w:right="851" w:bottom="851" w:left="851" w:header="0" w:footer="0" w:gutter="0"/>'
      + `${rtl ? "<w:bidi/>" : ""}</w:sectPr></w:body></w:document>`;
    const rel = (id, type, target) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;
    const title = esc(paper.querySelector("h1")?.textContent || "CV");
    return zip([
      ["[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
        + '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
        + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'],
      ["_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + rel("rId1", "officeDocument", "word/document.xml")
        + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'],
      ["docProps/core.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">'
        + `<dc:title>${title} - CV</dc:title><dc:creator>${title}</dc:creator></cp:coreProperties>`],
      ["word/_rels/document.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + rel("rId1", "styles", "styles.xml") + rel("rId2", "numbering", "numbering.xml") + "</Relationships>"],
      ["word/document.xml", document],
      ["word/styles.xml", styles(rtl)],
      ["word/numbering.xml", numbering(rtl)],
    ]);
  }

  window.MasarDocx = { fromPaper };
})();
