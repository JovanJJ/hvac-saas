"use client";
export default function AccountError({ reset }: { reset: () => void }) {
  return (
    <main>
      <h1>Nalog trenutno nije dostupan</h1>
      <p>Nije moguće učitati radne prostore. Pokušajte ponovo.</p>
      <button className="button primary" onClick={reset}>
        Pokušaj ponovo
      </button>
    </main>
  );
}
