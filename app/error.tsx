"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main>
      <h1>Stranica trenutno nije dostupna</h1>
      <p>Podaci nisu učitani. Pokušajte ponovo ili otvorite nalog.</p>
      <div className="actions">
        <button className="button primary" onClick={reset}>
          Pokušaj ponovo
        </button>
        <Link href="/account" className="button secondary">
          Moj nalog
        </Link>
      </div>
    </main>
  );
}
