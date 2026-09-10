import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@rekindle/supabase';
import { Button } from '@rekindle/ui/button';
import { Input } from '@rekindle/ui/input';
import { Label } from '@rekindle/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@rekindle/ui/card';
import { toast } from '@rekindle/ui/use-toast';
import { Loader2 } from 'lucide-react';

export default function SignUpScreen() {
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;

      if (!data.session) {
        // Email confirmation is required before a session exists — the
        // developer_accounts row (and companyName) is created on first
        // dashboard load instead, once they confirm and log in.
        setCheckEmail(true);
        return;
      }

      // Confirmation disabled (or auto-confirmed) — session exists now.
      await supabase.functions.invoke('developer-api-keys', { body: { action: 'account', companyName } });
      navigate('/dashboard');
    } catch (error: any) {
      toast({ title: 'Sign up failed', description: error?.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  if (checkEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <CardTitle>Check your email</CardTitle>
            <CardDescription>We sent a confirmation link to {email}. Confirm it, then log in below.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/login"><Button className="w-full">Go to login</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Get API Access</CardTitle>
          <CardDescription>Free Ministry Meetings plan — 10 hours/month, no card required.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company / project name</Label>
              <Input id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Inc." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create account
            </Button>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-4">
            Already have an account? <Link to="/login" className="text-primary hover:underline">Log in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
