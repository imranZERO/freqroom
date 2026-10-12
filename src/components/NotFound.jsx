import { Link } from 'wouter';
import { SiteHeader, SiteFooter } from './SiteChrome.jsx';

// Any path that isn't a page; the build prerenders it as 404.html
export function NotFound({ chrome }) {
  return (
    <div className="app">
      <SiteHeader {...chrome} subtitle="Interactive EQ ear training for producers, engineers, and audiophiles" />
      <main className="app-main">
        <section className="card not-found">
          <h2>404 · Page not found</h2>
          <p>There's nothing at this address.</p>
          <Link href="/" className="btn-primary">Back to the trainer</Link>
        </section>
      </main>
      <SiteFooter page="not-found" />
    </div>
  );
}
