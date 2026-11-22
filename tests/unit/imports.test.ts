import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { parseImport } from "../../features/imports/parser";
import { suggestMapping } from "../../features/imports/model";
const parse = (text: string) => parseImport("oprema.csv", Buffer.from(text));
export function workbook(
  sheet: string,
  extra: Record<string, Uint8Array> = {},
) {
  return zipSync({
    "xl/workbook.xml": strToU8(
      '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Oprema" r:id="rId1"/></sheets></workbook>',
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
    ...extra,
  });
}
test("CSV preserves quoted delimiters, multiline text, Serbian letters, leading zero serials and physical row numbers", () => {
  const g = parse(
    '\uFEFFOznaka lokacije;Oznaka sistema;Prostorija;Serijski broj\r\n ja-02 ;kl-01;"Čačak; šuma";00023\r\n;;;\r\nja-02;kl-02;"Red 1\nRed ""2""";0',
  );
  assert.equal(g.rows.length, 2);
  assert.equal(g.rows[0].cells[2], "Čačak; šuma");
  assert.equal(g.rows[0].cells[3], "00023");
  assert.equal(g.rows[1].number, 4);
  assert.equal(g.rows[1].cells[2], 'Red 1\nRed "2"');
  assert.deepEqual(suggestMapping(g.headers), {
    siteCode: 0,
    systemCode: 1,
    room: 2,
    serial: 3,
  });
});
test("CSV rejects malformed quoting, unsupported types, invalid UTF8 and bounds", () => {
  for (const value of [
    'a,b\n"x,y',
    "a,a\nx,y",
    "a,b\nx,y,z",
    'a,b\n"x"oops,y',
    "a,b\n" + "x".repeat(2001) + ",y",
    "a,b\n" + "x,y\n".repeat(501),
  ])
    assert.throws(() => parse(value));
  assert.throws(() => parseImport("file.xls", Buffer.from("abc")));
  assert.throws(() => parseImport("file.csv", new Uint8Array([255, 254])));
  assert.throws(() => parseImport("file.csv", new Uint8Array(524289)));
});
const sheet =
  '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>siteCode</t></is></c><c r="B1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>JA-02</t></is></c><c r="B2" t="inlineStr"><is><t>00001</t></is></c></row></sheetData></worksheet>';
test("XLSX reads inline/shared strings and text serials without evaluating formulas", () => {
  const bytes = workbook(sheet, {
    "xl/sharedStrings.xml": strToU8(
      "<sst><si><r><t>system</t></r><r><t>Code</t></r></si></sst>",
    ),
  });
  const g = parseImport("units.xlsx", bytes);
  assert.deepEqual(g.headers, ["siteCode", "systemCode"]);
  assert.equal(g.rows[0].cells[1], "00001");
  assert.throws(() =>
    parseImport(
      "units.xlsx",
      workbook(sheet.replace("<v>0</v>", "<f>1+1</f><v>0</v>")),
    ),
  );
});
test("XLSX rejects oversized decompression, entities, missing parts, macros, huge sparse coordinates and blank headers", () => {
  for (const bytes of [
    workbook(sheet, { "xl/big.xml": new Uint8Array(2 * 1024 * 1024 + 1) }),
    workbook('<!DOCTYPE x [<!ENTITY x "hi">]>' + sheet),
    workbook(sheet, { "xl/vbaProject.bin": new Uint8Array([1]) }),
    workbook(sheet.replace('r="2"', 'r="9999999"')),
    workbook(sheet.replace('r="A1"', 'r="C1"')),
    zipSync({ a: strToU8("no workbook") }),
  ])
    assert.throws(() => parseImport("units.xlsx", bytes));
});
