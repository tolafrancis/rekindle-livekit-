import React, { useEffect, useState } from 'react';
import { ChevronUp } from 'lucide-react';

interface BackToTopProps {
  /** Pixels the window must scroll before the button appears. */
  threshold?: number;
  /** Extra classes to tweak placement/appearance per host if ever needed. */
  className?: string;
}

/**
 * Universal "Back to Top" button.
 *
 * Mounted once at the app root so it works on every scrollable page without any
 * page-specific wiring. It watches the window scroll position, fades/slides in
 * once the user has scrolled a reasonable distance, and smoothly scrolls back to
 * the top when tapped. It sits below full-screen overlays (z-40) so immersive
 * viewers naturally hide it, and stays out of the way in the bottom-left corner.
 */
export const BackToTop: React.FC<BackToTopProps> = ({ threshold = 300, className = '' }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > threshold);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // sync on mount (e.g. after route change restores scroll)
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Back to top"
      title="Back to top"
      className={`fixed bottom-4 left-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white/90 text-purple-600 shadow-lg backdrop-blur transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-white hover:text-purple-700 ${
        visible
          ? 'translate-y-0 scale-100 opacity-100'
          : 'pointer-events-none translate-y-3 scale-90 opacity-0'
      } ${className}`}
    >
      <ChevronUp className="h-5 w-5" />
    </button>
  );
};

export default BackToTop;
