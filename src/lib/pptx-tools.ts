/**
 * PPTX file manipulation using JSZip.
 * PPTX format is a ZIP archive containing OOXML XML files.
 */
import JSZip from "jszip";

export interface PptxSlide {
  index: number; // 1-based
  title: string;
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/** Read all slide titles from a PPTX ArrayBuffer. */
export async function readPptxSlides(buffer: ArrayBuffer): Promise<PptxSlide[]> {
  const zip = await JSZip.loadAsync(buffer);

  const presXml = await zip.file("ppt/presentation.xml")?.async("text");
  if (!presXml) throw new Error("無効なPPTXファイルです（presentation.xml が見つかりません）");

  const presRelsXml = await zip.file("ppt/_rels/presentation.xml.rels")?.async("text");
  if (!presRelsXml) throw new Error("PPTXの構造が破損しています（presentation rels が見つかりません）");

  // rId → slide file path (e.g. "slides/slide1.xml")
  const rIdToFile = parseSlideRels(presRelsXml);

  // Ordered rIds from sldIdLst
  const orderedRIds = getSlideRIdOrder(presXml);

  const slides: PptxSlide[] = [];
  for (let i = 0; i < orderedRIds.length; i++) {
    const rId = orderedRIds[i];
    const relTarget = rIdToFile.get(rId);
    if (!relTarget) continue;

    // Normalise path: "slides/slide1.xml" → "ppt/slides/slide1.xml"
    const slidePath = relTarget.startsWith("slides/")
      ? `ppt/${relTarget}`
      : relTarget.replace(/^\.\.\//, "ppt/");

    const slideXml = await zip.file(slidePath)?.async("text");
    if (!slideXml) continue;

    const title = extractTitleFromSlide(slideXml);
    slides.push({ index: i + 1, title: title || `スライド ${i + 1}` });
  }

  return slides;
}

/**
 * Insert a table-of-contents slide into a PPTX and return the modified binary.
 * @param buffer     Original PPTX as ArrayBuffer
 * @param slides     Slide list from readPptxSlides()
 * @param insertAfter Insert after this slide index (1-based). Default = 1 (after cover).
 */
export async function insertTocSlide(
  buffer: ArrayBuffer,
  slides: PptxSlide[],
  insertAfter = 1
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(buffer);

  // Determine new slide file number (max existing + 1)
  const existingNums = Object.keys(zip.files)
    .map((f) => f.match(/^ppt\/slides\/slide(\d+)\.xml$/)?.[1])
    .filter(Boolean)
    .map(Number);
  const newSlideNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;

  // Borrow the slide layout reference from slide 2 (or 1) so the TOC inherits the theme
  const refNum = slides.length >= 2 ? 2 : 1;
  const refRelsXml = await zip.file(`ppt/slides/_rels/slide${refNum}.xml.rels`)?.async("text");
  let layoutTarget = "../slideLayouts/slideLayout2.xml";
  if (refRelsXml) {
    const m = refRelsXml.match(/Type="[^"]*slideLayout"[^>]*Target="([^"]+)"/);
    if (m) layoutTarget = m[1];
  }

  // Build TOC entries (only slides with real titles)
  const tocEntries = slides
    .filter((s) => s.title && !s.title.match(/^スライド \d+$/))
    .map((s) => `${s.index}. ${s.title}`);
  if (tocEntries.length === 0) {
    tocEntries.push(...slides.map((s) => `${s.index}. ${s.title}`));
  }

  // Add new slide files to the ZIP
  zip.file(`ppt/slides/slide${newSlideNum}.xml`, buildTocSlideXml(tocEntries));
  zip.file(
    `ppt/slides/_rels/slide${newSlideNum}.xml.rels`,
    buildSlideRelsXml(layoutTarget)
  );

  // Update ppt/presentation.xml and ppt/_rels/presentation.xml.rels
  await patchPresentation(zip, newSlideNum, insertAfter);

  // Register the new slide in [Content_Types].xml
  await patchContentTypes(zip, newSlideNum);

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

// ─────────────────────────────────────────────
// XML helpers
// ─────────────────────────────────────────────

function parseSlideRels(relsXml: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b([^>]+)\/>/g)) {
    const attrs = m[1];
    const id = attrs.match(/\bId="([^"]+)"/)?.[1];
    const type = attrs.match(/\bType="([^"]+)"/)?.[1];
    const target = attrs.match(/\bTarget="([^"]+)"/)?.[1];
    // Only slide relationships (not slideLayout, slideMaster, etc.)
    if (id && type && target && /\/slide$/.test(type)) {
      map.set(id, target.replace(/^\.\.\//, ""));
    }
  }
  return map;
}

function getSlideRIdOrder(presXml: string): string[] {
  const section = presXml.match(/<p:sldIdLst\b[^>]*>([\s\S]*?)<\/p:sldIdLst>/)?.[1] ?? "";
  return [...section.matchAll(/r:id="([^"]+)"/g)].map((m) => m[1]);
}

/** Extract the title text from a single slide XML string. */
function extractTitleFromSlide(slideXml: string): string {
  let rest = slideXml;
  while (rest.length > 0) {
    // Find next <p:sp> opening (but not <p:spTree> etc.)
    const start = rest.search(/<p:sp[\s>]/);
    if (start === -1) break;

    const end = rest.indexOf("</p:sp>", start);
    if (end === -1) break;

    const block = rest.slice(start, end + 7);

    if (
      block.includes('type="title"') ||
      block.includes("type='title'") ||
      block.includes('type="ctrTitle"') ||
      block.includes("type='ctrTitle'")
    ) {
      const texts = [...block.matchAll(/<a:t>([^<]*)<\/a:t>/g)]
        .map((m) => m[1].trim())
        .filter(Boolean);
      return texts.join("");
    }

    rest = rest.slice(end + 7);
  }
  return "";
}

async function patchPresentation(zip: JSZip, newSlideNum: number, insertAfter: number) {
  const presXml = (await zip.file("ppt/presentation.xml")!.async("text"))!;
  const relsXml = (await zip.file("ppt/_rels/presentation.xml.rels")!.async("text"))!;

  // New rId = max existing + 1
  const maxRId = Math.max(
    0,
    ...[...relsXml.matchAll(/Id="rId(\d+)"/g)].map((m) => parseInt(m[1]))
  );
  const newRId = `rId${maxRId + 1}`;

  // New sldId = max existing + 1 (must be ≥ 256 per spec)
  const maxSldId = Math.max(
    255,
    ...[...presXml.matchAll(/\bid="(\d+)"/g)].map((m) => parseInt(m[1]))
  );
  const newSldId = maxSldId + 1;

  // Append relationship
  const updatedRels = relsXml.replace(
    "</Relationships>",
    `  <Relationship Id="${newRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${newSlideNum}.xml"/>\n</Relationships>`
  );

  // Insert sldId entry after the insertAfter-th slide
  const sldIdEntry = `<p:sldId id="${newSldId}" r:id="${newRId}"/>`;
  const allMatches = [...presXml.matchAll(/<p:sldId\s[^>]*\/>/g)];

  let updatedPres: string;
  if (allMatches.length === 0) {
    // Presentation has no slides yet
    updatedPres = presXml
      .replace("<p:sldIdLst/>", `<p:sldIdLst>${sldIdEntry}</p:sldIdLst>`)
      .replace(/(<p:sldIdLst[^>]*>)/, `$1${sldIdEntry}`);
  } else {
    const idx = Math.max(0, Math.min(insertAfter - 1, allMatches.length - 1));
    const target = allMatches[idx];
    const pos = (target.index ?? 0) + target[0].length;
    updatedPres = presXml.slice(0, pos) + sldIdEntry + presXml.slice(pos);
  }

  zip.file("ppt/presentation.xml", updatedPres);
  zip.file("ppt/_rels/presentation.xml.rels", updatedRels);
}

async function patchContentTypes(zip: JSZip, newSlideNum: number) {
  const ctXml = await zip.file("[Content_Types].xml")?.async("text");
  if (!ctXml || ctXml.includes(`slide${newSlideNum}.xml`)) return;

  const updated = ctXml.replace(
    "</Types>",
    `  <Override PartName="/ppt/slides/slide${newSlideNum}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>\n</Types>`
  );
  zip.file("[Content_Types].xml", updated);
}

function buildSlideRelsXml(layoutTarget: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="${layoutTarget}"/>
</Relationships>`;
}

function buildTocSlideXml(entries: string[]): string {
  const paras = entries
    .map((e) => {
      const esc = e
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `      <a:p><a:r><a:rPr lang="ja-JP" dirty="0"/><a:t>${esc}</a:t></a:r></a:p>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Title 1"/>
          <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
          <p:nvPr><p:ph type="title"/></p:nvPr>
        </p:nvSpPr>
        <p:spPr/>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p><a:r><a:rPr lang="ja-JP" dirty="0"/><a:t>目次</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Content Placeholder 2"/>
          <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
          <p:nvPr><p:ph idx="1"/></p:nvPr>
        </p:nvSpPr>
        <p:spPr/>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
${paras}
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClr/></p:clrMapOvr>
</p:sld>`;
}
