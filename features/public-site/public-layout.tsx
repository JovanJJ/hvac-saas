import Link from "next/link";
import { Suspense } from "react";
import { publicAccountLink } from "./account-link";
import { PublicNavigation } from "./public-navigation";
import { demoAvailable } from "./availability";
import { PublicContainer } from "./components";
import { LegalLinks } from "./legal-links";
import "./public-site.css";

async function AccountAction() {
  const account = await publicAccountLink();
  return (
    <Link href={account?.href ?? "/sign-in"} prefetch={false}>
      {account?.label ?? "Prijava"}
    </Link>
  );
}

async function RegistrationAction() {
  if (await publicAccountLink()) return null;
  return <Link href="/sign-up" prefetch={false}>Registracija</Link>;
}

function AccountPending() {
  return <span className="public-account-pending" role="status">Provera naloga…</span>;
}

export function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-site">
      <a href="#public-content" className="public-skip-link">Pređi na sadržaj</a>
      <header className="public-header">
        <PublicContainer className="public-header-inner">
          <Link href="/" className="public-brand" aria-label="teren. — početna">
            teren<span>.</span>
          </Link>
          {/* Stream only account links, preserving the interactive menu and its state. */}
          <PublicNavigation
            demoAvailable={demoAvailable}
            accountAction={
              <Suspense fallback={<AccountPending />}><AccountAction /></Suspense>
            }
            registrationAction={
              <Suspense fallback={null}><RegistrationAction /></Suspense>
            }
          />
        </PublicContainer>
      </header>
      <PublicContainer as="main" id="public-content" tabIndex={-1} className="public-main">
        {children}
      </PublicContainer>
      <footer className="public-footer">
        <PublicContainer className="public-footer-inner">
          <div>
            <Link href="/" className="public-brand">teren<span>.</span></Link>
            <p>Softver za servisere klima-uređaja</p>
            <LegalLinks />
          </div>
          <nav aria-label="Navigacija u podnožju">
            <Link href="/#kako-radi">Kako radi</Link>
            <Link href="/#cene">Cene</Link>
            <Link href="/#pitanja">Pitanja</Link>
            {demoAvailable && <Link href="/demo">Demonstracija</Link>}
            <Suspense fallback={<AccountPending />}><AccountAction /></Suspense>
            <Suspense fallback={null}><RegistrationAction /></Suspense>
          </nav>
        </PublicContainer>
      </footer>
    </div>
  );
}
