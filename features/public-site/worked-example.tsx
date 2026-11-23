import captures from "@/public/primeri/workflow.json";
import { PublicSectionHeading } from "./components";

export function WorkedExample() {
  return (
    <section className="public-section public-worked-example" aria-labelledby="public-example-title">
      <PublicSectionHeading id="public-example-title">Šta ostaje da se uradi posle posete?</PublicSectionHeading>
      <p>U poslovnici su planirane četiri klime. Dve su servisirane, trećoj je potrebna popravka, a četvrta je u zaključanoj arhivi. U izveštaju se vidi šta je pregledano i ko preuzima naredni korak.</p>
      <p className="public-example-summary">
        {captures.totals.planned} planirana sistema · {captures.totals.inspected} pregledana · {captures.totals.actions} otvorene stavke
      </p>
      <ul className="public-example-rows">
        {captures.example.map(item => (
          <li key={item.code}>
            <h3>{item.code}<span>{item.room}</span></h3>
            <dl>
              <div><dt>Nalaz</dt><dd>{item.finding}</dd></div>
              <div><dt>Sledeća radnja</dt><dd>{item.nextAction}</dd></div>
            </dl>
          </li>
        ))}
      </ul>
      <p className="public-example-caption">Primer naloga iz Jagodine · izmišljeni podaci</p>
    </section>
  );
}
