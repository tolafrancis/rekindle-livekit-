import { Button } from '@rekindle/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@rekindle/ui/card';
import { cn } from '@rekindle/ui/utils';

// Phase 2 — thin shell. Proves the standalone Ministry app builds and runs on
// the shared @rekindle/* packages (design system + client). Real ministry
// surfaces get moved in from apps/rekindle incrementally, per the master plan.
const SHARED_PACKAGES = [
  '@rekindle/types',
  '@rekindle/supabase',
  '@rekindle/auth',
  '@rekindle/live',
  '@rekindle/ui',
  '@rekindle/features',
];

export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">ReKindle Ministry</CardTitle>
          <CardDescription>
            Standalone church product — thin shell (Phase 2). Rendered with the
            shared design system.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {SHARED_PACKAGES.map((p) => (
              <span
                key={p}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium',
                  'bg-muted text-muted-foreground',
                )}
              >
                {p}
              </span>
            ))}
          </div>
          <Button className="w-full">Consuming @rekindle/ui</Button>
        </CardContent>
      </Card>
    </div>
  );
}
