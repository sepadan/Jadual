const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const GROUPS_PER_PAGE = 6;

function ascii(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00b7/g, "-")
    .replace(/[^\x20-\x7e\n]/g, "?");
}

function literal(value) {
  return ascii(value).replace(/([\\()])/g, "\\$1");
}

function number(value) {
  return Number(value).toFixed(2).replace(/\.00$/, "");
}

function estimatedWidth(value, size) {
  return ascii(value).split("").reduce((width, character) => {
    if ("MW@%".includes(character)) return width + size * .78;
    if ("ilI1.,' ".includes(character)) return width + size * .28;
    // Helvetica capitals are wider than a simple half-em estimate.  A slightly
    // conservative width keeps long teacher names inside their merged cell.
    return width + size * .66;
  }, 0);
}

function wrapLine(value, width, size) {
  const words = ascii(value).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || estimatedWidth(candidate, size) <= width) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  return lines;
}

function wrapped(value, width, size) {
  return ascii(value).split("\n").flatMap((line) => wrapLine(line, width, size));
}

function textCommand(value, x, y, size, bold = false) {
  return `BT /${bold ? "F2" : "F1"} ${number(size)} Tf 1 0 0 1 ${number(x)} ${number(y)} Tm (${literal(value)}) Tj ET`;
}

function lineCommand(x1, y1, x2, y2) {
  return `${number(x1)} ${number(y1)} m ${number(x2)} ${number(y2)} l S`;
}

function drawTextBlock(commands, value, x, y, width, height, options = {}) {
  const align = options.align || "center";
  const bold = options.bold === true;
  const maxLines = options.maxLines || 3;
  const minSize = options.minSize || 4;
  let size = options.size || 7;
  let lines = wrapped(value, Math.max(4, width - 4), size);
  while (lines.length > maxLines && size > minSize) {
    size -= .4;
    lines = wrapped(value, Math.max(4, width - 4), size);
  }
  lines = lines.slice(0, maxLines);
  const lineHeight = size * 1.12;
  const totalHeight = lines.length * lineHeight;
  const firstBaseline = y + ((height + totalHeight) / 2) - size;
  lines.forEach((line, index) => {
    let left = x + 2;
    if (align === "center") left = x + (width - estimatedWidth(line, size)) / 2;
    if (align === "right") left = x + width - estimatedWidth(line, size) - 2;
    commands.push(textCommand(line, Math.max(x + 1, left), firstBaseline - index * lineHeight, size, bold));
  });
}

function drawHeading(commands, model, pageNumber, pageCount) {
  const top = PAGE_HEIGHT - 24;
  commands.push(textCommand(`TARIKH: ${model.dateLabel || model.date || ""}`, 22, top, 8, false));
  commands.push(textCommand(`HARI: ${model.dayLabel || ""}`, 22, top - 15, 8, false));
  drawTextBlock(commands, ascii(model.school || "SEKOLAH").toUpperCase(), 245, top - 1, 352, 16, { size: 11, bold: true, maxLines: 1, minSize: 7 });
  drawTextBlock(commands, "JADUAL GURU GANTI", 245, top - 18, 352, 16, { size: 10, maxLines: 1 });
  if (pageCount > 1) commands.push(textCommand(`MUKA ${pageNumber}/${pageCount}`, PAGE_WIDTH - 72, top, 7));
}

function values(slot, field) {
  const items = slot?.[field] || [];
  return Array.isArray(items) ? items.join("\n") : String(items || "");
}

function drawTable(commands, model, groups) {
  const tableX = 22;
  const tableTop = PAGE_HEIGHT - 78;
  const tableWidth = PAGE_WIDTH - 44;
  const headerHeight = 40;
  const rowHeight = 22;
  const nameWidth = 124;
  const labelWidth = 58;
  const periodCount = Math.max(1, model.periods.length);
  const periodWidth = (tableWidth - nameWidth - labelWidth) / periodCount;
  const tableBottom = tableTop - headerHeight - groups.length * rowHeight * 3;
  const nameRight = tableX + nameWidth;
  const labelRight = nameRight + labelWidth;

  commands.push("0 G 0 g .65 w");
  commands.push(lineCommand(tableX, tableTop, tableX + tableWidth, tableTop));
  commands.push(lineCommand(tableX, tableBottom, tableX + tableWidth, tableBottom));
  commands.push(lineCommand(tableX, tableBottom, tableX, tableTop));
  commands.push(lineCommand(tableX + tableWidth, tableBottom, tableX + tableWidth, tableTop));
  commands.push(lineCommand(tableX, tableTop - headerHeight, tableX + tableWidth, tableTop - headerHeight));
  commands.push(lineCommand(labelRight, tableBottom, labelRight, tableTop));
  for (let index = 1; index < periodCount; index += 1) {
    const x = labelRight + index * periodWidth;
    commands.push(lineCommand(x, tableBottom, x, tableTop));
  }
  commands.push(lineCommand(nameRight, tableBottom, nameRight, tableTop - headerHeight));

  drawTextBlock(commands, "MASA", tableX, tableTop - headerHeight, nameWidth + labelWidth, headerHeight, { size: 8, bold: true, maxLines: 1 });
  model.periods.forEach((period, index) => {
    const x = labelRight + index * periodWidth;
    drawTextBlock(commands, `${period.period}\n${period.startTime}\n${period.endTime}`, x, tableTop - headerHeight, periodWidth, headerHeight, { size: 6.4, bold: true, maxLines: 3, minSize: 5 });
  });

  groups.forEach((group, groupIndex) => {
    const groupTop = tableTop - headerHeight - groupIndex * rowHeight * 3;
    const groupBottom = groupTop - rowHeight * 3;
    commands.push(lineCommand(tableX, groupBottom, tableX + tableWidth, groupBottom));
    commands.push(lineCommand(nameRight, groupTop - rowHeight, tableX + tableWidth, groupTop - rowHeight));
    commands.push(lineCommand(nameRight, groupTop - rowHeight * 2, tableX + tableWidth, groupTop - rowHeight * 2));

    drawTextBlock(commands, "NAMA GURU\nTIDAK HADIR", tableX + 2, groupTop - 25, nameWidth - 4, 22, { size: 5.5, bold: true, maxLines: 2, minSize: 5 });
    drawTextBlock(commands, group.teacherName || "GURU", tableX + 2, groupBottom + 5, nameWidth - 4, 38, { size: 8.5, bold: true, maxLines: 3, minSize: 5.2 });
    drawTextBlock(commands, "KELAS", nameRight, groupTop - rowHeight, labelWidth, rowHeight, { size: 7, bold: true, maxLines: 1 });
    drawTextBlock(commands, "GURU\nGANTI", nameRight, groupTop - rowHeight * 2, labelWidth, rowHeight, { size: 7, bold: true, maxLines: 2 });
    drawTextBlock(commands, "T/TANGAN", nameRight, groupBottom, labelWidth, rowHeight, { size: 7, bold: true, maxLines: 1 });

    model.periods.forEach((period, periodIndex) => {
      const x = labelRight + periodIndex * periodWidth;
      const slot = group.slots?.[period.period];
      drawTextBlock(commands, values(slot, "classes"), x, groupTop - rowHeight, periodWidth, rowHeight, { size: 6.5, maxLines: 3, minSize: 4.4 });
      drawTextBlock(commands, values(slot, "replacements"), x, groupTop - rowHeight * 2, periodWidth, rowHeight, { size: 6.5, maxLines: 3, minSize: 4.4 });
    });
  });

  commands.push(textCommand(`Sistem Jadual - ${model.school || ""}`, tableX, Math.max(10, tableBottom - 13), 6));
}

function pageContent(model, groups, pageNumber, pageCount) {
  const commands = [];
  drawHeading(commands, model, pageNumber, pageCount);
  drawTable(commands, model, groups);
  return `${commands.join("\n")}\n`;
}

function encode(value) {
  return new TextEncoder().encode(value);
}

function concat(chunks) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => { result.set(chunk, offset); offset += chunk.length; });
  return result;
}

export function buildReliefPdf(model) {
  if (!model?.periods?.length || !model?.groups?.length) throw new Error("Tiada relief untuk dijana sebagai PDF.");
  const pages = [];
  for (let index = 0; index < model.groups.length; index += GROUPS_PER_PAGE) pages.push(model.groups.slice(index, index + GROUPS_PER_PAGE));
  const objectCount = 4 + pages.length * 2;
  const objects = new Array(objectCount + 1);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  const pageRefs = pages.map((_, index) => `${5 + index * 2} 0 R`).join(" ");
  objects[2] = `<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  pages.forEach((groups, index) => {
    const pageId = 5 + index * 2;
    const contentId = pageId + 1;
    const content = pageContent(model, groups, index + 1, pages.length);
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${encode(content).length} >>\nstream\n${content}endstream`;
  });

  const chunks = [encode("%PDF-1.4\n% Sistem Jadual\n")];
  const offsets = new Array(objects.length).fill(0);
  let cursor = chunks[0].length;
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = cursor;
    const chunk = encode(`${id} 0 obj\n${objects[id]}\nendobj\n`);
    chunks.push(chunk);
    cursor += chunk.length;
  }
  const xrefOffset = cursor;
  let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(encode(xref));
  return concat(chunks);
}

export function shouldUseDirectPdf(navigatorRef = globalThis.navigator) {
  const userAgent = String(navigatorRef?.userAgent || "");
  const platform = String(navigatorRef?.platform || "");
  return Boolean(navigatorRef?.userAgentData?.mobile)
    || /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)
    || (/Mac/i.test(platform) && Number(navigatorRef?.maxTouchPoints) > 1);
}

export function openReliefPdf(model, filename = "Jadual-Relief.pdf", environment = globalThis) {
  const bytes = buildReliefPdf(model);
  const blob = new environment.Blob([bytes], { type: "application/pdf" });
  const url = environment.URL.createObjectURL(blob);
  const opened = typeof environment.open === "function" ? environment.open(url, "_blank") : null;
  if (!opened && environment.document) {
    const link = environment.document.createElement("a");
    link.href = url;
    link.download = filename;
    link.target = "_blank";
    link.rel = "noopener";
    environment.document.body.appendChild(link);
    link.click();
    link.remove();
  }
  (environment.setTimeout || setTimeout)(() => environment.URL.revokeObjectURL(url), 120000);
  return { bytes, url };
}
