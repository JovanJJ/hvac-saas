import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL("features/offline/shell-assets.json", root), "utf8"),
);
const template = await readFile(
  new URL("features/offline/service-worker.js", root),
  "utf8",
);
const digest = createHash("sha256")
  .update(template)
  .update(JSON.stringify(manifest));
for (const file of manifest.files) {
  if (!/^\/offline\/v\d+\/[a-z0-9.-]+$/.test(file))
    throw new Error("Only public offline-shell assets may be precached.");
  digest.update(file).update(await readFile(new URL("public" + file, root)));
}
const revision = digest.digest("hex").slice(0, 12);
async function writeChanged(path, value) {
  const url = new URL(path, root);
  if ((await readFile(url, "utf8").catch(() => "")) !== value)
    await writeFile(url, value);
}
await writeChanged(
  "public/sw.js",
  template
    .replace("__SHELL_VERSION__", String(manifest.version))
    .replace("__SHELL_REVISION__", revision)
    .replace("__SHELL_FILES__", JSON.stringify(manifest.files)),
);
await writeChanged(
  "public/offline/shell-version.json",
  JSON.stringify({ version: manifest.version, revision }) + "\n",
);
console.log(
  `Prepared public offline shell v${manifest.version} (${revision}).`,
);
