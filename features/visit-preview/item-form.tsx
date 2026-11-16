import { useState } from "react";
import { Button } from "./components";
import {
  Item,
  needsAction,
  Outcome,
  outcomeLabels,
  ReadingStatus,
  validateItem,
} from "./model";

type Props = { item: Item; onChange: (item: Item) => void; onSave: () => void };
export default function ItemForm({ item, onChange, onSave }: Props) {
  const [attempted, setAttempted] = useState(false);
  const errors = attempted ? validateItem(item) : [];
  function update(patch: Partial<Item>) {
    onChange({ ...item, ...patch });
  }
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setAttempted(true);
        if (!validateItem(item).length) onSave();
      }}
      className="card form-card"
    >
      <div className="section-heading">
        <span className="eyebrow">NALAZ NA SISTEMU</span>
        <h2>
          {item.code} · {item.room}
        </h2>
        <p>{item.model}</p>
        <p className="muted">
          Prethodni nalaz: nema zabeleženih nalaza u probnom primeru.
        </p>
      </div>
      <fieldset>
        <legend>Ishod rada</legend>
        <div className="outcomes">
          {(Object.keys(outcomeLabels) as Outcome[])
            .filter((o) => o !== "pending")
            .map((outcome) => (
              <label
                className={
                  item.outcome === outcome ? "outcome selected" : "outcome"
                }
                key={outcome}
              >
                <input
                  type="radio"
                  name="outcome"
                  value={outcome}
                  checked={item.outcome === outcome}
                  onChange={() =>
                    update({
                      outcome,
                      ...(outcome === "no_access"
                        ? {
                            readingStatus: "not_measured",
                            reading: "",
                            work: "",
                          }
                        : {}),
                    })
                  }
                />
                {outcomeLabels[outcome]}
              </label>
            ))}
        </div>
      </fieldset>
      {item.outcome !== "no_access" && (
        <label>
          Obavljeni radovi
          <textarea
            value={item.work}
            onChange={(e) => update({ work: e.target.value })}
            placeholder="Na primer: očišćeni filteri i proveren rad"
          />
        </label>
      )}
      <label>
        {item.outcome === "no_access"
          ? "Razlog nedostupnosti"
          : "Nalaz za klijenta"}
        <textarea
          value={item.finding}
          onChange={(e) => update({ finding: e.target.value })}
        />
      </label>
      {item.outcome !== "no_access" && (
        <fieldset>
          <legend>Temperatura izduva · hlađenje</legend>
          <div className="form-grid">
            <label>
              Status merenja
              <select
                value={item.readingStatus}
                onChange={(e) =>
                  update({
                    readingStatus: e.target.value as ReadingStatus,
                    reading: "",
                  })
                }
              >
                <option value="not_measured">Nije mereno</option>
                <option value="measured">Izmereno</option>
                <option value="not_applicable">Nije primenljivo</option>
              </select>
            </label>
            {item.readingStatus === "measured" && (
              <label>
                Vrednost (°C)
                <input
                  inputMode="decimal"
                  value={item.reading}
                  onChange={(e) => update({ reading: e.target.value })}
                  aria-describedby="reading-hint"
                />
                <small id="reading-hint">
                  Nula je izmerena vrednost. Prihvata se decimalni zarez.
                </small>
              </label>
            )}
          </div>
        </fieldset>
      )}
      {needsAction(item) && (
        <fieldset className="follow-up">
          <legend>
            {item.outcome === "repair_needed"
              ? "Priprema ponude"
              : "Organizovanje ponovne posete"}
          </legend>
          <label>
            Sledeći korak
            <textarea
              value={item.action}
              onChange={(e) => update({ action: e.target.value })}
            />
          </label>
          <div className="form-grid">
            <label>
              Odgovorna osoba
              <select
                value={item.owner}
                onChange={(e) => update({ owner: e.target.value })}
              >
                <option value="">Izaberite osobu</option>
                <option>Jelena Jovanović</option>
                <option>Marko Petrović</option>
              </select>
            </label>
            <label>
              Rok
              <input
                type="date"
                value={item.deadline}
                onChange={(e) => update({ deadline: e.target.value })}
              />
            </label>
          </div>
        </fieldset>
      )}
      <label>
        Interna beleška <small>Vidljiva samo timu</small>
        <textarea
          value={item.internalNote}
          onChange={(e) => update({ internalNote: e.target.value })}
        />
      </label>
      {errors.length > 0 && (
        <div className="errors" role="alert">
          <strong>Proverite unos</strong>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="muted">
        Unos ostaje u ovoj probnoj sesiji. Osvežavanje stranice briše izmene.
      </p>
      <div className="actions">
        <button className="button primary" type="submit">
          Sačuvaj i vrati se
        </button>
        <Button secondary onClick={onSave}>
          Nazad na posetu
        </Button>
      </div>
    </form>
  );
}
