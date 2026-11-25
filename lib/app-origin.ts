// Pure origin validation shared by build metadata and server runtime configuration.
export function configuredAppOrigin(runtimeEnv: Record<string, string | undefined>) {
  const value =
    runtimeEnv.APP_URL ||
    (runtimeEnv.NODE_ENV !== "production" ? "http://localhost:3000" : "");
  if (!value) throw new Error("APP_URL is required in production.");
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("APP_URL must be an application origin.");
  }
  if (
    runtimeEnv.NODE_ENV === "production" &&
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  ) {
    throw new Error("Production APP_URL must use HTTPS.");
  }
  return url.origin;
}

