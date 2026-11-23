import { currentUser } from "@/features/auth/dal";
import { selectedWorkspace } from "@/features/workspaces/dal";
import { readExport } from "@/features/exports/dal";
import { exportFiles, ExportSizeError } from "@/features/exports/csv";
import { exportSchema, type ExportSnapshot } from "@/features/exports/model";
const headers = {
  "Cache-Control": "private, no-store", Vary: "Cookie",
  "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
};
const failure = (status: number, message: string) => Response.json({ message }, { status, headers });
export async function GET(request: Request) {
  if (!(await currentUser())) return failure(401, "Prijavite se za preuzimanje.");
  const { workspace } = await selectedWorkspace();
  if (!workspace || workspace.role !== "owner") return failure(404, "Izvoz nije dostupan.");
  const query = new URL(request.url).searchParams;
  const parsed = exportSchema.safeParse({ datasets: query.getAll("dataset"), site: query.get("site") || "" });
  if (!parsed.success || [...query.keys()].some(key => !["dataset", "site"].includes(key)) || query.getAll("site").length>1)
    return failure(422, "Izaberite skupove podataka i važeću lokaciju.");
  try {
    const { data, error } = await readExport(workspace.organization.id, parsed.data.datasets, parsed.data.site);
    if (error) return failure(error.code === "54000" ? 413 : error.code === "42501" ? 404 : 503,
      error.code === "54000" ? "Izvoz je prevelik. Izaberite jednu lokaciju ili manje skupova podataka." : "Izvoz nije dostupan. Osvežite stanje i pokušajte ponovo.");
    const file = exportFiles(data as unknown as ExportSnapshot, parsed.data.datasets);
    return new Response(new Uint8Array(file.bytes), { headers: { ...headers,
      "Content-Type": file.contentType, "Content-Length": String(file.bytes.byteLength),
      "Content-Disposition": `attachment; filename="${file.filename}"`,
    } });
  } catch (error) {
    return failure(error instanceof ExportSizeError ? 413 : 503,
      error instanceof ExportSizeError ? "Izvoz je prevelik. Smanjite obuhvat." : "Izvoz nije završen. Pokušajte ponovo.");
  }
}
