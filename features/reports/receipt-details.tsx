import type { ReportReceipt } from "./receipt-model";
export function ReceiptDetails({
  receipt,
  timeZone,
}: {
  receipt: ReportReceipt;
  timeZone: string;
}) {
  return (
    <div className="my-3" role="status">
      <p className="font-semibold">Prijem je potvrđen.</p>
      <p>
        Potvrdio/la: {receipt.name} · {receipt.role}
      </p>
      <p>
        Vreme potvrde:{" "}
        {new Date(receipt.confirmedAt).toLocaleString("sr-Latn-RS", {
          timeZone,
        })}{" "}
        · Putem linka za klijenta
      </p>
      <p>
        Ova naknadna potvrda ne menja izvorni PDF i ne odobrava dodatne radove,
        troškove ili obračun.
      </p>
    </div>
  );
}
