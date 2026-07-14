import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

// Floating "back to top" button — appears once the page is scrolled down past
// `threshold` px, and smooth-scrolls to the top on click. Mount once at a shell
// level so it shows on every content page. Uses window scroll (the app content
// scrolls on the body).
export function ScrollToTopButton({ threshold = 400 }: { threshold?: number }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > threshold);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  if (!show) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Scroll to top"
      className="fixed bottom-20 right-4 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg ring-1 ring-black/5 transition hover:scale-105 md:bottom-6"
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}

export default ScrollToTopButton;
