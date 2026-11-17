// Shared by server-only evidence handlers and the separate worker; never imported by clients.
export function cloudinarySettings(env: Record<string, string | undefined>) {
  const url = env.CLOUDINARY_URL ? new URL(env.CLOUDINARY_URL) : null;
  const cloud_name = env.CLOUDINARY_NAME || url?.hostname;
  const api_key =
    env.CLOUDINARY_API_KEY || (url && decodeURIComponent(url.username));
  const api_secret =
    env.CLOUDINARY_API_SECRET || (url && decodeURIComponent(url.password));
  if (
    !cloud_name ||
    !api_key ||
    !api_secret ||
    !/^[a-z0-9_-]+$/i.test(cloud_name)
  )
    throw new Error("evidence_configuration");
  return {
    cloud_name,
    api_key,
    api_secret,
    secure: true,
    signature_algorithm: "sha256" as const,
    timeout: 20000,
  };
}
