import Link from "next/link";
import { Suspense } from "react";
import { publicAccountLink } from "./account-link";
import { PublicNavigation } from "./public-navigation";
import "./public-site.css";

// Unfinished demo destination is explicitly local-only until UX07.
const demoAvailable = process.env.NODE_ENV === "development";

async function AccountNavigation() {
  return <PublicNavigation account={await publicAccountLink()} demoAvailable={demoAvailable} />;
}

async function FooterAccount() {
  const account = await publicAccountLink();
  return account
    ? <Link href={account.href} prefetch={false}>{account.label}</Link>
    : <><Link href="/sign-in" prefetch={false}>Prijava</Link><Link href="/sign-up" prefetch={false}>Registracija</Link></>;
}

export function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-site">
      <a href="#public-content" className="public-skip-link">Pređi na sadržaj</a>
      <header className="public-header">
        <div className="public-container public-header-inner">
          <Link href="/" className="public-brand" aria-label="teren. — početna">teren<span>.</span></Link>
          <Suspense fallback={<PublicNavigation account={null} pending demoAvailable={demoAvailable} />}>
            <AccountNavigation />
          </Suspense>
        </div>
      </header>
      <main id="public-content" tabIndex={-1} className="public-container public-main">{children}</main>
      <footer className="public-footer">
        <div className="public-container public-footer-inner">
          <div><Link href="/" className="public-brand">teren<span>.</span></Link><p>Softver za servisere klima-uređaja</p></div>
          <nav aria-label="Navigacija u podnožju">
            {demoAvailable && <Link href="/demo">Demonstracija</Link>}
            <Suspense fallback={<span role="status">Provera naloga…</span>}><FooterAccount /></Suspense>
          </nav>
        </div>
      </footer>
    </div>
  );
}
