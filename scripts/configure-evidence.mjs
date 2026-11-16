import { readFile, writeFile, appendFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import { withDatabase } from "./database.mjs";

try {
  const env = process.env;
  const url = env.CLOUDINARY_URL ? new URL(env.CLOUDINARY_URL) : null;
  const config = {
    cloud_name: env.CLOUDINARY_NAME || url?.hostname,
    api_key:
      env.CLOUDINARY_API_KEY || (url && decodeURIComponent(url.username)),
    api_secret:
      env.CLOUDINARY_API_SECRET || (url && decodeURIComponent(url.password)),
    secure: true,
    timeout: 20000,
  };
  if (!config.cloud_name || !config.api_key || !config.api_secret)
    throw new Error("configuration");
  let preset;
  try {
    preset = await cloudinary.api.upload_preset("hvac_evidence_v1", config);
  } catch (error) {
    if ((error.http_code ?? error.error?.http_code) !== 404) throw error;
  }
  if (!preset)
    preset = await cloudinary.api.create_upload_preset({
      ...config,
      name: "hvac_evidence_v1",
      unsigned: false,
      type: "authenticated",
      overwrite: false,
      allowed_formats: ["jpg", "png", "webp"],
    });
  if (
    preset.unsigned !== false ||
    preset.settings.type !== "authenticated" ||
    preset.settings.overwrite !== false ||
    JSON.stringify([...preset.settings.allowed_formats].sort()) !==
      JSON.stringify(["jpg", "png", "webp"])
  )
    throw new Error("preset_mismatch");
  await withDatabase(async (db) => {
    const { rows } = await db.query(
      "select secret from hvac_private.evidence_verifier where singleton",
    );
    const secret =
      env.EVIDENCE_VERIFICATION_SECRET ||
      rows[0]?.secret ||
      randomBytes(32).toString("hex");
    if (
      !/^[a-f0-9]{64}$/.test(secret) ||
      (rows.length && rows[0].secret !== secret)
    )
      throw new Error("verifier_mismatch");
    const contents = await readFile(".env", "utf8");
    const emptySetting =
      /^EVIDENCE_VERIFICATION_SECRET[ \t]*=[ \t]*(?:""|'')?[ \t]*$/m;
    if (
      !env.EVIDENCE_VERIFICATION_SECRET &&
      /^EVIDENCE_VERIFICATION_SECRET[ \t]*=/m.test(contents) &&
      !emptySetting.test(contents)
    )
      throw new Error("verifier_setting_mismatch");
    await db.query(
      "insert into hvac_private.evidence_verifier(singleton,secret) values(true,$1) on conflict(singleton) do nothing",
      [secret],
    );
    if (!env.EVIDENCE_VERIFICATION_SECRET && emptySetting.test(contents))
      await writeFile(
        ".env",
        contents.replace(
          emptySetting,
          `EVIDENCE_VERIFICATION_SECRET=${secret}`,
        ),
      );
    else if (!env.EVIDENCE_VERIFICATION_SECRET)
      await appendFile(
        ".env",
        `\n# Server-only evidence verification; must match the private database verifier.\nEVIDENCE_VERIFICATION_SECRET=${secret}\n`,
      );
  });
  console.log(
    "PASS: authenticated upload preset and private verifier configured. No credentials were logged.",
  );
} catch {
  console.error(
    "Evidence configuration failed. Check provider credentials, preset restrictions and matching verifier settings. No credentials were logged.",
  );
  process.exitCode = 1;
}
