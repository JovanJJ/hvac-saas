import {
  activeIdentity,
  listBundles,
  removeBundle,
  verifyIdentity,
  currentEpoch,
  changeEvent,
} from "./storage.js";
const root = document.getElementById("app");
const outcomes = {
  pending: "Čeka unos",
  serviced: "Servisirano",
  repair_needed: "Potrebna popravka",
  no_access: "Bez pristupa",
};
const kinds = {
  quote: "Priprema ponude",
  repair: "Popravka",
  revisit: "Ponovni dolazak",
};
let renderVersion = 0;
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function link(label, href) {
  const a = node("a", label, "button");
  a.href = href;
  return a;
}
function message(text, error = false) {
  root.replaceChildren(node("h1", "Preuzete posete"), node("p", text));
  if (error) root.lastChild.setAttribute("role", "alert");
  root.append(link("Otvori Danas uz vezu", "/today"));
}
function date(value, zone) {
  return new Date(value).toLocaleString("sr-Latn-RS", { timeZone: zone });
}
function details(bundle) {
  const visit = bundle.visit;
  const fragment = document.createDocumentFragment();
  fragment.append(
    link("Preuzete posete", "/offline/v1/index.html"),
    node("h1", visit.site),
    node("p", `${visit.customer} · ${visit.address}`),
    node("p", `${date(visit.start, visit.timeZone)} · ${visit.timeZone}`),
  );
  if (visit.contact) fragment.append(node("p", `Kontakt: ${visit.contact}`));
  if (visit.accessNote)
    fragment.append(node("p", `Pristup: ${visit.accessNote}`, "card"));
  if (visit.correctionReason)
    fragment.append(
      node("p", `Zatražena dopuna: ${visit.correctionReason}`, "card"),
    );
  if (bundle.source) {
    const source = node("section", undefined, "card");
    source.append(
      node("h2", `Izvorni nalaz · ${bundle.source.code}`),
      node(
        "p",
        bundle.source.finding ||
          bundle.source.noAccessReason ||
          bundle.source.work,
      ),
    );
    if (bundle.source.customerAction)
      source.append(
        node("p", `Potrebno od klijenta: ${bundle.source.customerAction}`),
      );
    fragment.append(source);
  }
  const totals = node("dl", undefined, "totals");
  const values = [
    ["Planirano", visit.items.filter((i) => i.planned).length],
    [
      "Pregledano",
      visit.items.filter((i) =>
        ["serviced", "repair_needed"].includes(i.outcome),
      ).length,
    ],
    [
      "Otvorene radnje",
      visit.items.filter((i) => i.followUp && i.followUp.state !== "completed")
        .length,
    ],
  ];
  for (const [label, count] of values) {
    const group = node("div");
    group.append(node("dt", label), node("dd", String(count)));
    totals.append(group);
  }
  fragment.append(totals);
  for (const item of visit.items) {
    const card = node("section", undefined, "card");
    card.append(
      node("h2", `${item.code} · ${item.room}`),
      node("p", `${item.model} · ${item.serial}`),
      node("p", outcomes[item.outcome]),
    );
    for (const [label, value] of [
      ["Radovi", item.work],
      ["Nalaz", item.finding],
      ["Razlog bez pristupa", item.noAccessReason],
      ["Interna beleška", item.internalNote],
    ])
      if (value) card.append(node("p", `${label}: ${value}`));
    for (const reading of item.readings)
      card.append(
        node(
          "p",
          `${reading.kind}: ${reading.status === "measured" ? `${reading.value} ${reading.unit}` : reading.status === "not_measured" ? "Nije mereno" : "Nije primenljivo"} · ${reading.mode}`,
        ),
      );
    for (const part of item.parts)
      card.append(
        node("p", `Materijal: ${part.name} · ${part.quantity} ${part.unit}`),
      );
    if (item.followUp) {
      const action = item.followUp;
      const owner =
        visit.staff.find((s) => s.id === action.ownerId)?.label ||
        action.ownerLabel ||
        "Nedostaje";
      card.append(
        node(
          "p",
          `${kinds[action.kind]} · ${action.state === "completed" ? "Završeno" : "Otvoreno"} · Odgovoran: ${owner} · Rok: ${action.dueDate || "Nedostaje"}`,
        ),
      );
      if (action.customerAction)
        card.append(
          node("p", `Potrebno od klijenta: ${action.customerAction}`),
        );
    }
    if (item.correctedAt)
      card.append(
        node(
          "p",
          `Ispravljeno u kancelariji: ${item.correctedByLabel || "Raniji član tima"} · ${date(item.correctedAt, visit.timeZone)}`,
          "muted",
        ),
      );
    if (item.enteredByLabel)
      card.append(node("p", `Uneo: ${item.enteredByLabel}`, "muted"));
    fragment.append(card);
  }
  fragment.append(
    node(
      "p",
      `Fotografije (${bundle.photoCount}) se ne preuzimaju u ovom koraku. Za pregled fotografija i unos potrebna je veza.`,
    ),
  );
  fragment.append(link("Otvori unos uz vezu", `/visits/${visit.id}`));
  return fragment;
}
async function render() {
  const version = ++renderVersion;
  root.replaceChildren(node("p", "Učitavanje sa telefona…"));
  try {
    const identity = await activeIdentity();
    if (!identity) {
      message(
        "Povežite se i otvorite Danas da biste potvrdili nalog i radni prostor za ovaj telefon.",
      );
      return;
    }
    const bundles = await listBundles(identity);
    if (version !== renderVersion || identity.epoch !== currentEpoch()) return;
    const fragment = document.createDocumentFragment();
    fragment.append(
      node("p", `teren. · ${identity.organizationName}`, "muted"),
      node("p", `Nalog: ${identity.userLabel || "Potvrđeni nalog"}`, "muted"),
      node(
        "p",
        "Sačuvana kopija · samo pregled. Unos i predaja zahtevaju vezu.",
      ),
    );
    const pathId = location.pathname.match(/^\/visits\/([0-9a-f-]{36})$/i)?.[1];
    const visitId = pathId || new URL(location.href).searchParams.get("visit");
    if (visitId) {
      const bundle = bundles.find((b) => b.visit.id === visitId);
      if (!bundle) {
        fragment.append(
          node("h1", "Poseta nije preuzeta"),
          node(
            "p",
            "Ova poseta nije dostupna bez veze u trenutnom nalogu i radnom prostoru. Preuzmite je na ekranu Danas dok ste povezani.",
          ),
          link("Preuzete posete", "/offline/v1/index.html"),
        );
      } else {
        fragment.append(
          node(
            "p",
            `Preuzeto: ${date(bundle.downloadedAt, bundle.visit.timeZone)}`,
          ),
          details(bundle),
        );
      }
    } else {
      fragment.append(node("h1", "Preuzete posete"));
      if (!bundles.length)
        fragment.append(
          node(
            "p",
            "Nema preuzetih poseta za ovaj nalog i radni prostor. Preuzmite posetu na ekranu Danas uz vezu.",
          ),
        );
      for (const bundle of bundles.sort((a, b) =>
        a.visit.start.localeCompare(b.visit.start),
      )) {
        const card = node("article", undefined, "card");
        card.append(
          node("h2", bundle.visit.site),
          node("p", bundle.visit.address),
          node("p", date(bundle.visit.start, bundle.visit.timeZone)),
          node(
            "p",
            `${bundle.visit.items.length} sistema · Preuzeto: ${date(bundle.downloadedAt, bundle.visit.timeZone)}`,
          ),
          link(
            "Otvori preuzetu posetu",
            `/offline/v1/index.html?visit=${bundle.visit.id}`,
          ),
        );
        const remove = node("button", "Ukloni sa telefona");
        remove.type = "button";
        remove.addEventListener("click", async () => {
          remove.disabled = true;
          try {
            await removeBundle(identity, bundle.visit.id);
            await render();
          } catch {
            card.append(
              node(
                "p",
                "Uklanjanje nije uspelo. Kopija je zadržana; pokušajte ponovo.",
              ),
            );
            remove.disabled = false;
          }
        });
        card.append(remove);
        fragment.append(card);
      }
      fragment.append(link("Otvori Danas uz vezu", "/today"));
    }
    if (version === renderVersion && identity.epoch === currentEpoch())
      root.replaceChildren(fragment);
  } catch {
    message(
      "Memorija telefona nije dostupna. Povežite se i pokušajte ponovo; nijedna poseta nije prikazana.",
      true,
    );
  }
}
window.addEventListener(changeEvent, render);
window.addEventListener("storage", render);
let epoch = currentEpoch();
setInterval(() => {
  if (epoch !== currentEpoch()) {
    epoch = currentEpoch();
    void render();
  }
}, 500);
async function reconnect() {
  try {
    await verifyIdentity();
  } catch {
    /* A network failure preserves the last verified partition; a 401 locks and clears it. */
  }
  await render();
}
window.addEventListener("online", reconnect);
window.addEventListener("pageshow", () => {
  if (navigator.onLine) void reconnect();
  else void render();
});
window.addEventListener("pagehide", () => {
  root.replaceChildren();
});
// A local lock is available even when the server cannot be contacted.
window.addEventListener("storage", (event) => {
  if (event.key === "teren-offline-boundary") root.replaceChildren();
});
void render();
