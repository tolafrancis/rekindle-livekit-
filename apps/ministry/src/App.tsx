import { AuthProvider } from '@rekindle/features/AuthContext';
import { LanguageProvider } from '@rekindle/features/LanguageContext';
import MinistriesHub from '@rekindle/ministry/components/MinistriesHub';

// Phase 2 — the standalone Ministry app now renders a REAL ministry surface
// (the ministry hub → space) from the shared @rekindle/ministry package, wrapped
// in the shared auth + language providers from @rekindle/features. Routing/entry
// and ministry-scoped tenancy are the next Phase 2 steps.
export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <div className="min-h-screen bg-background text-foreground">
          <MinistriesHub />
        </div>
      </AuthProvider>
    </LanguageProvider>
  );
}
