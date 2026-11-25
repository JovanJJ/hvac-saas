import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { build } from "esbuild";
const root = new URL("../", import.meta.url);
async function writeChanged(path, value) {
  const url = new URL(path, root);
  if ((await readFile(url, "utf8").catch(() => "")) !== value)
    await writeFile(url, value);
}
await writeChanged("public/offline/v2/field.css", await readFile(new URL("features/field/field.css", root), "utf8"));
const common = {
  absWorkingDir: fileURLToPath(root),
  bundle: true,
  write: false,
  minify: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
};
const storage = await build({
  ...common,
  entryPoints: ["lib/offline/storage.ts"],
});
await writeChanged("public/offline/v2/storage.js", storage.outputFiles[0].text);
const app = await build({
  ...common,
  entryPoints: ["features/offline/offline-app.tsx"],
  plugins: [
    {
      name: "shared-device-storage",
      setup(builder) {
        builder.onResolve({ filter: /^@\/lib\/offline\/storage$/ }, () => ({
          path: "/offline/v2/storage.js",
          external: true,
        }));
      },
    },
  ],
});
await writeChanged("public/offline/v2/app.js", app.outputFiles[0].text);
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
await writeChanged(
  "public/sw.js",
  template
    .replace("__SHELL_VERSION__", String(manifest.version))
    .replace("__SHELL_REVISION__", revision)
    .replace("__SHELL_FILES__", JSON.stringify(manifest.files))
    .replaceAll("__SHELL_ENTRY__", manifest.entry),
);
await writeChanged(
  "public/offline/shell-version.json",
  JSON.stringify({ version: manifest.version, revision }) + "\n",
);
console.log(
  `Prepared public offline shell v${manifest.version} (${revision}).`,
);
