// Pure configuration validation. Never include values in thrown errors or logs.
export function externalMailSettings(app, stack) {
  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_ADMIN_EMAIL"];
  for (const key of required) {
    if (!stack[key] || /[\r\n\0]/.test(stack[key])) throw new Error(`Configure ${key} in the Supabase project .env.`);
  }
  if (/^(supabase-mail|mail|mailpit|inbucket|localhost|127\.0\.0\.1|::1)$/i.test(stack.SMTP_HOST) || /example\.|\.invalid$/i.test(stack.SMTP_HOST))
    throw new Error("SMTP_HOST still points to a local inbox or placeholder.");
  if (!/^[a-z0-9.-]+$/i.test(stack.SMTP_HOST)) throw new Error("SMTP_HOST must be a hostname.");
  const port = Number(stack.SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SMTP_PORT is invalid.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(stack.SMTP_ADMIN_EMAIL) || stack.SMTP_ADMIN_EMAIL.length > 254)
    throw new Error("SMTP_ADMIN_EMAIL must be the provider's allowed sender address.");
  if (/^(fake_mail_|REPLACE|your[-_])/i.test(stack.SMTP_USER) || /^(fake_mail_|REPLACE|your[-_])/i.test(stack.SMTP_PASS))
    throw new Error("Replace the placeholder SMTP credentials.");
  if (stack.SMTP_USER === "sender@gmail.com" || stack.SMTP_ADMIN_EMAIL === "sender@gmail.com")
    throw new Error("Replace SMTP_USER and SMTP_ADMIN_EMAIL with your real sender account; sender@gmail.com is only an example.");
  let origin;
  try {
    const url = new URL(app.APP_URL);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
    origin = url.origin;
  } catch { throw new Error("Set APP_URL to the application's actual origin in this project .env."); }
  const sender = stack.SMTP_SENDER_NAME || "Teren";
  if (sender.length > 120 || /[\r\n\0]/.test(sender)) throw new Error("SMTP_SENDER_NAME is invalid.");
  return {
    SMTP_HOST: stack.SMTP_HOST, SMTP_PORT: stack.SMTP_PORT,
    SMTP_USER: stack.SMTP_USER, SMTP_PASS: stack.SMTP_PASS,
    SMTP_ADMIN_EMAIL: stack.SMTP_ADMIN_EMAIL,
    SMTP_SENDER_NAME: sender,
    HVAC_MAIL_APP_ORIGIN: origin,
  };
}
export function mailComposeArgs({ directory, project, files, overlay, envFile }) {
  if (!directory || !project || !files.length) throw new Error("Existing Supabase Compose labels are missing.");
  const args = ["compose", "--project-directory", directory, "--env-file", envFile, "-p", project];
  for (const file of [...new Set([...files, overlay])]) args.push("-f", file);
  return args;
}
