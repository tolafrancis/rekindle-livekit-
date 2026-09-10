import { Link } from 'react-router-dom';
import { Button } from '@rekindle/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@rekindle/ui/card';
import { Video, KeyRound, Users, Zap } from 'lucide-react';

const QUICKSTART = `curl -X POST https://<project>.functions.supabase.co/meetings-api \\
  -H "Authorization: Bearer rkm_live_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{ "action": "create", "title": "Weekly Sync" }'`;

export default function LandingScreen() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between py-4">
          <span className="font-semibold text-lg">Interactive Meetings API</span>
          <div className="flex items-center gap-2">
            <Link to="/login"><Button variant="ghost">Log in</Button></Link>
            <Link to="/signup"><Button>Get API Access</Button></Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto py-16 px-4 max-w-4xl">
        <div className="text-center space-y-4 mb-14">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Free Ministry Meetings, <span className="text-primary">as an API</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Create and run live video meetings from your own app or server. Any
            company, any product — no ReKindle account or ministry required.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Link to="/signup"><Button size="lg">Get API Access</Button></Link>
            <Link to="/login"><Button size="lg" variant="outline">Log in</Button></Link>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mb-14">
          <Card>
            <CardHeader>
              <Zap className="h-6 w-6 text-primary mb-1" />
              <CardTitle className="text-base">Free to start</CardTitle>
              <CardDescription>4 meetings/month, no card required.</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <Video className="h-6 w-6 text-primary mb-1" />
              <CardTitle className="text-base">Your own UI</CardTitle>
              <CardDescription>Mint join tokens and render the call with any LiveKit client SDK.</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <Users className="h-6 w-6 text-primary mb-1" />
              <CardTitle className="text-base">Up to 10 participants</CardTitle>
              <CardDescription>Multi-party rooms, up to 60 minutes each.</CardDescription>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4" /> Quickstart
            </CardTitle>
            <CardDescription>Sign up, create a key, and start a meeting.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted rounded-lg p-4 text-xs overflow-x-auto"><code>{QUICKSTART}</code></pre>
          </CardContent>
        </Card>
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        Built on ReKindle's LiveKit infrastructure.
      </footer>
    </div>
  );
}
