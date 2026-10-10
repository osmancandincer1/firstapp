/**
 * Placeholder landing page (Phase 0). Legal pages, account deletion
 * (/hesap-sil), child safety standards and the admin panel come in later
 * phases (APP.md §13.1, §14).
 */
export default function Home() {
  return (
    <main>
      <div className="dots" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} />
        ))}
      </div>
      <h1>Nokuzo</h1>
      <p>Her akşam dokuzda, dokuz kişi.</p>
      <p>Yapım aşamasında.</p>
    </main>
  );
}
