// Brand-only artwork: no customer records, capabilities, pricing or unverified commercial claims.
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#e6f0eb"/><rect x="32" y="32" width="1136" height="566" rx="24" fill="#fff" stroke="#cbd9d3"/>
<g font-family="DejaVu Sans, sans-serif" fill="#153238"><text x="82" y="122" font-size="56" font-weight="700">teren.</text>
<text x="82" y="246" font-size="52" font-weight="700">Servisni nalog na telefonu.</text>
<text x="82" y="316" font-size="52" font-weight="700">PDF izveštaj za klijenta.</text>
<text x="82" y="390" font-size="26" fill="#475f63">Od zakazane posete do poslatog izveštaja.</text>
<rect x="82" y="454" width="1036" height="80" rx="12" fill="#e6f0eb"/>
<text x="112" y="505" font-size="25" fill="#08665f">Raspored  ·  Nalazi sa terena  ·  Izveštaj za klijenta</text></g></svg>`;
await writeFile("public/social/teren-preview.svg", svg + "\n");
await sharp(Buffer.from(svg)).png().toFile("public/social/teren-preview.png");
console.log("Generated 1200×630 public brand preview.");

// Reuse the existing teren. device mark rather than shipping the scaffold favicon.
const icon = await sharp(await readFile("public/offline/v1/icon.svg")).resize(32, 32).png().toBuffer();
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico[6] = 32; ico[7] = 32; ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(icon.length, 14); ico.writeUInt32LE(22, 18);
await writeFile("app/favicon.ico", Buffer.concat([ico, icon]));
