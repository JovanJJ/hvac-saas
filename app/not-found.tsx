import Link from "next/link";
export default function NotFound() {
  return (
    <main>
      <h1>Stranica nije dostupna</h1>
      <p>Stranica ne postoji ili ovom nalogu nije dozvoljen pristup.</p>
      <Link href="/account" className="button secondary">
        Moj nalog
      </Link>
    </main>
  );
}
