import { unzipSync } from "fflate";
import { SaxesParser } from "saxes";
import { posix } from "node:path";
import { importLimits as limits, type ImportGrid } from "./model";
class ImportParseError extends Error {}
function invalid(message: string): never {
  throw new ImportParseError(message);
}
function decode(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return invalid("Fajl mora biti u UTF-8 kodiranju.");
  }
}
function csv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0];
  // Count separators outside quoted fields, including escaped quotes.
  const counts = [",", ";", "\t"]
    .map((separator) => {
      let quoted = false,
        count = 0;
      for (let i = 0; i < first.length; i++) {
        if (first[i] === '"') {
          if (quoted && first[i + 1] === '"') i++;
          else quoted = !quoted;
        } else if (!quoted && first[i] === separator) count++;
      }
      return { separator, count };
    })
    .sort((a, b) => b.count - a.count);
  const delimiter = counts[0].separator,
    rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const pushCell = () => {
    row.push(cell);
    cell = "";
    closed = false;
    if (row.length > limits.columns)
      invalid("Najviše 32 kolone su dozvoljene.");
  };
  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
    if (rows.length > limits.rows + 1)
      invalid("Najviše 500 redova podataka je dozvoljeno.");
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += char;
    } else if (char === delimiter) pushCell();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      pushRow();
    } else if (char === '"' && !cell && !closed) quoted = true;
    else {
      if (closed || char === '"') invalid("Neispravni navodnici u CSV fajlu.");
      cell += char;
    }
    if (cell.length > limits.cell)
      invalid("Ćelija može sadržati najviše 2000 znakova.");
  }
  if (quoted) invalid("Nezatvoreni navodnici u CSV fajlu.");
  if (cell || row.length || closed) pushRow();
  return rows;
}
function xml(
  bytes: Uint8Array | undefined,
  handlers: {
    open?: (name: string, attrs: Record<string, string>) => void;
    close?: (name: string) => void;
    text?: (text: string) => void;
  },
) {
  if (!bytes) invalid("Nedostaje obavezan deo XLSX fajla.");
  const parser = new SaxesParser({ xmlns: true });
  let depth = 0,
    tokens = 0;
  parser.on("doctype", () =>
    invalid("XML deklaracije entiteta nisu dozvoljene."),
  );
  parser.on("opentag", (tag) => {
    if (++depth > 64 || ++tokens > 100000)
      invalid("XLSX struktura je previše složena.");
    const attrs: Record<string, string> = {};
    for (const a of Object.values(tag.attributes)) {
      attrs[a.name] = a.value;
      attrs[a.local] ??= a.value;
    }
    handlers.open?.(tag.local, attrs);
  });
  parser.on("closetag", (tag) => {
    handlers.close?.(tag.local);
    depth--;
  });
  parser.on("text", (text) => handlers.text?.(text));
  parser.on("cdata", (text) => handlers.text?.(text));
  parser.write(decode(bytes!)).close();
}
function xlsx(bytes: Uint8Array): string[][] {
  let entries = 0,
    total = 0;
  const names = new Set<string>();
  const files = unzipSync(bytes, {
    filter(file) {
      if (
        ++entries > 100 ||
        file.originalSize > 2 * 1024 * 1024 ||
        (total += file.originalSize) > 8 * 1024 * 1024 ||
        names.has(file.name)
      )
        invalid(
          "XLSX arhiva prelazi dozvoljenu veličinu ili ima ponovljene delove.",
        );
      names.add(file.name);
      if (/vbaProject|externalLinks/i.test(file.name))
        invalid("Makroi i spoljne veze nisu dozvoljeni.");
      return /^(xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml))$/.test(
        file.name,
      );
    },
  });
  let sheetId = "",
    sheetCount = 0,
    target = "";
  xml(files["xl/workbook.xml"], {
    open(name, a) {
      if (name === "sheet") {
        sheetId = a["r:id"] || a.id;
        sheetCount++;
      }
    },
  });
  if (sheetCount !== 1)
    invalid(
      "XLSX mora sadržati tačno jedan radni list. Izdvojite list koji želite da uvezete.",
    );
  xml(files["xl/_rels/workbook.xml.rels"], {
    open(name, a) {
      if (name === "Relationship" && a.Id === sheetId) {
        if (a.TargetMode === "External")
          invalid("Spoljne veze nisu dozvoljene.");
        target = posix.normalize(
          a.Target.startsWith("/") ? a.Target.slice(1) : `xl/${a.Target}`,
        );
      }
    },
  });
  if (!/^xl\/worksheets\/[^/]+\.xml$/.test(target))
    invalid("Neispravna putanja radnog lista.");
  const shared: string[] = [];
  let sharedText = "",
    inText = false;
  if (files["xl/sharedStrings.xml"])
    xml(files["xl/sharedStrings.xml"], {
      open(name) {
        if (name === "si") sharedText = "";
        if (name === "t") inText = true;
      },
      text(text) {
        if (inText) {
          sharedText += text;
          if (sharedText.length > limits.cell)
            invalid("Tekst ćelije je predugačak.");
        }
      },
      close(name) {
        if (name === "t") inText = false;
        if (name === "si") {
          shared.push(sharedText);
          if (shared.length > 16032) invalid("Previše deljenih tekstova.");
        }
      },
    });
  const rows: string[][] = [];
  let row: string[] = [],
    rowNumber = 0,
    col = 0,
    type = "",
    value = "",
    capture = false,
    formula = false;
  xml(files[target], {
    open(name, a) {
      if (name === "row") {
        rowNumber = Number(a.r || rowNumber + 1);
        if (
          !Number.isInteger(rowNumber) ||
          rowNumber < 1 ||
          rowNumber > limits.rows + 1 ||
          rows[rowNumber - 1]
        )
          invalid("Neispravna ili prevelika numeracija redova.");
        row = [];
      }
      if (name === "c") {
        const ref = /^([A-Z]+)([1-9]\d*)$/.exec(a.r || "");
        if (!ref || Number(ref[2]) !== rowNumber)
          invalid("Ćelija nema važeću oznaku reda.");
        col = 0;
        for (const c of ref[1]) col = col * 26 + c.charCodeAt(0) - 64;
        col--;
        if (col >= limits.columns || row[col] !== undefined)
          invalid("Previše ili ponovljene kolone.");
        type = a.t || "n";
        value = "";
        formula = false;
      }
      if (name === "f") formula = true;
      if (name === "v" || name === "t") capture = true;
    },
    text(text) {
      if (capture) {
        value += text;
        if (value.length > limits.cell) invalid("Tekst ćelije je predugačak.");
      }
    },
    close(name) {
      if (name === "v" || name === "t") capture = false;
      if (name === "c") {
        if (formula)
          invalid(
            "Formule nisu dozvoljene. Nalepite njihove vrednosti u novi fajl.",
          );
        if (type === "s") {
          if (!/^\d+$/.test(value) || shared[Number(value)] === undefined)
            invalid("Neispravan deljeni tekst.");
          value = shared[Number(value)];
        } else if (!["n", "inlineStr", "str"].includes(type))
          invalid("Podržane su samo tekstualne i brojčane ćelije.");
        row[col] = value;
      }
      if (name === "row") rows[rowNumber - 1] = row;
    },
  });
  return Array.from({ length: rows.length }, (_, i) => rows[i] || []);
}
export function parseImport(filename: string, bytes: Uint8Array): ImportGrid {
  if (bytes.length < 1 || bytes.length > limits.bytes)
    invalid("Izaberite fajl do 512 KiB.");
  let rows: string[][];
  try {
    if (/\.csv$/i.test(filename))
      rows = csv(decode(bytes).replace(/^\uFEFF/, ""));
    else if (/\.xlsx$/i.test(filename)) rows = xlsx(bytes);
    else return invalid("Podržani su samo CSV i XLSX fajlovi.");
  } catch (error) {
    if (error instanceof ImportParseError) throw error;
    return invalid("Fajl nije ispravan CSV/XLSX dokument.");
  }
  const first = rows.shift() || [];
  const headers = Array.from({ length: first.length }, (_, i) =>
    (first[i] || "").trim(),
  );
  if (
    headers.length < 2 ||
    headers.length > limits.columns ||
    headers.some((h) => !h || h.length > 120) ||
    new Set(headers).size !== headers.length
  )
    invalid(
      "Prvi red mora imati 2–32 različita, neprazna naziva kolona (do 120 znakova).",
    );
  const data = rows
    .map((cells, index) => ({
      number: index + 2,
      cells: Array.from({ length: headers.length }, (_, i) => cells[i] || ""),
    }))
    .filter((row) => row.cells.some((c) => c.trim()));
  if (
    !data.length ||
    data.length > limits.rows ||
    rows.some((row) => row.length > headers.length) ||
    data.some((row) =>
      row.cells.some((c) => c.length > limits.cell || c.includes("\0")),
    )
  )
    invalid("Proverite broj redova, širinu tabele i sadržaj ćelija.");
  const grid = { headers, rows: data };
  if (Buffer.byteLength(JSON.stringify(grid)) > limits.bytes)
    invalid("Sadržaj tabele prelazi 512 KiB.");
  return grid;
}
