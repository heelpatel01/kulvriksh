import Link from 'next/link';

// Development placeholder only. The public homepage design has not been selected,
// so this page deliberately contains no marketing content or decorative effects.
export default function HomePage() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="site-header">
        <div className="container">
          <Link className="wordmark" href="/">
            Kulvriksh
          </Link>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        <div className="container">
          <h1>Kulvriksh</h1>
          <p className="lead">Digital platform for family heritage and genealogy.</p>
          <p className="status-note">
            This is a development placeholder. The public website design has not yet been selected.
          </p>
        </div>
      </main>
      <footer className="site-footer">
        <div className="container">Kulvriksh Digital Platform: development build</div>
      </footer>
    </>
  );
}
