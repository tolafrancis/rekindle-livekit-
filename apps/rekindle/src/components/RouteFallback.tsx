import { Loader2 } from 'lucide-react';

// Suspense fallback shown while a code-split route or tab chunk downloads.
// `fullScreen` is for top-level routes; the inline variant sits inside the app
// shell so the header/nav stay put while a tab's code loads.
const RouteFallback = ({ fullScreen = true }: { fullScreen?: boolean }) => (
  <div className={`${fullScreen ? 'min-h-screen' : 'py-16'} flex items-center justify-center`}>
    <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
  </div>
);

export default RouteFallback;
