import React from 'react';
import { Link } from 'react-router-dom';

// Light frame for public, crawlable pages (prayers, devotionals): the
// brand linking home, a sign-up link, the page, and a footer.
export const PublicPageShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-white">
    <header className="border-b">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
        <Link to="/" className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
          Re<span className="text-purple-600">Kindle</span> BC
        </Link>
        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link to="/devotionals" className="text-gray-600 hover:text-gray-900">Devotionals</Link>
          <Link to="/prayers" className="text-gray-600 hover:text-gray-900">Prayers</Link>
          <Link to="/" className="rounded-full bg-purple-600 px-4 py-1.5 text-white hover:bg-purple-700">Sign up free</Link>
        </nav>
      </div>
    </header>
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">{children}</main>
    <footer className="border-t py-8 text-center text-sm text-gray-500">
      <Link to="/guide" className="hover:underline">Guide</Link>
      <span className="mx-2" aria-hidden>·</span>
      <Link to="/faq" className="hover:underline">FAQ</Link>
      <span className="mx-2" aria-hidden>·</span>
      <a href="https://rekindlebc.com/privacy" className="hover:underline">Privacy</a>
    </footer>
  </div>
);

export default PublicPageShell;
