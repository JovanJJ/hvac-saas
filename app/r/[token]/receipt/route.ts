import { guestClient } from "@/features/reports/guest-dal";
import { reportTokenSchema } from "@/features/reports/link-model";
import { receiptSchema } from "@/features/reports/receipt-model";
import { guestHeaders } from "@/features/reports/archive";
import { appOrigin } from "@/lib/supabase/config";
import { boundedBody, BodyTooLarge } from "@/features/evidence/request";
export async function POST(
  request: Request,
  { params }: RouteContext<"/r/[token]/receipt">,
) {
  const reply = (body: unknown, status: number) =>
    Response.json(body, { status, headers: guestHeaders });
  if (request.headers.get("origin") !== appOrigin())
    return reply({ message: "Zahtev nije dozvoljen." }, 403);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    return reply({ message: "Neispravan format zahteva." }, 415);
  const { token } = await params;
  if (!reportTokenSchema.safeParse(token).success)
    return reply({ message: "Link nije dostupan." }, 404);
  try {
    const input = receiptSchema.safeParse(
      JSON.parse((await boundedBody(request, 4096)).toString("utf8")),
    );
    if (!input.success)
      return reply(
        {
          message:
            "Unesite ime, ulogu i izričito potvrdite prijem ove revizije.",
        },
        422,
      );
    const { data, error } = await guestClient(token).rpc("acknowledge_report", {
      p_token: token,
      p_name: input.data.name,
      p_role: input.data.role,
      p_acknowledged: input.data.acknowledged,
    });
    if (error)
      return reply(
        {
          message:
            error.code === "42501"
              ? "Link je istekao, opozvan ili nije dostupan. Zatražite novi link."
              : error.code === "PT409"
                ? "Prijem je već potvrđen drugim podacima. Osvežite izveštaj da vidite zabeleženu potvrdu."
                : "Potvrda nije sačuvana. Proverite podatke i pokušajte ponovo.",
        },
        error.code === "42501"
          ? 404
          : error.code === "PT409"
            ? 409
            : error.code === "22023"
              ? 422
              : 503,
      );
    return reply({ receipt: data }, 200);
  } catch (error) {
    return reply(
      {
        message:
          error instanceof BodyTooLarge
            ? "Zahtev je prevelik."
            : "Potvrda nije sačuvana. Proverite podatke i pokušajte ponovo.",
      },
      error instanceof BodyTooLarge
        ? 413
        : error instanceof SyntaxError
          ? 422
          : 503,
    );
  }
}
