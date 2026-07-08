import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { validateReferralCode, type ReferralCode } from '@/lib/referralService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, AlertCircle, Loader2, UserPlus, Gift } from 'lucide-react';

interface ReferralInviteProps {
  onCodeValidated?: (code: string) => void;
  autoApply?: boolean;
}

const ReferralInvite: React.FC<ReferralInviteProps> = ({ onCodeValidated, autoApply = true }) => {
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState('');
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);
  const [validCode, setValidCode] = useState<ReferralCode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Auto-apply referral code from URL if present
    const refCode = searchParams.get('ref');
    if (refCode && autoApply) {
      setCode(refCode.toUpperCase());
      handleValidate(refCode.toUpperCase());
    }
  }, [searchParams, autoApply]);

  const handleValidate = async (codeToValidate?: string) => {
    const codeValue = (codeToValidate || code).trim().toUpperCase();
    
    if (!codeValue) {
      setError('Please enter a referral code');
      return;
    }

    setValidating(true);
    setError(null);

    try {
      const { valid, codeData, error: validationError } = await validateReferralCode(codeValue);

      if (valid && codeData) {
        setValidated(true);
        setValidCode(codeData);
        setError(null);
        onCodeValidated?.(codeValue);
      } else {
        setValidated(false);
        setValidCode(null);
        setError(validationError || 'Invalid referral code');
      }
    } catch (err: any) {
      setValidated(false);
      setValidCode(null);
      setError(err.message || 'Failed to validate code');
    } finally {
      setValidating(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    setCode(value);
    setError(null);
    setValidated(false);
    setValidCode(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="w-5 h-5" />
          Have a Referral Code?
        </CardTitle>
        <CardDescription>
          Enter the code shared by your friend to get started with bonus rewards
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Input Section */}
        <div className="flex gap-2">
          <Input
            placeholder="Enter referral code (e.g., FIRE123ABC)"
            value={code}
            onChange={handleChange}
            className="uppercase"
            disabled={validating || validated}
            maxLength={20}
          />
          <Button
            onClick={() => handleValidate()}
            disabled={validating || validated || !code}
          >
            {validating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : validated ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              'Apply'
            )}
          </Button>
        </div>

        {/* Validation Status */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {validated && validCode && (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <AlertDescription className="text-green-800">
              <div className="space-y-2">
                <p className="font-semibold">Referral Code Applied Successfully!</p>
                <div className="flex items-center gap-2 text-sm">
                  <Gift className="w-4 h-4" />
                  <span>You'll receive bonus rewards when you join:</span>
                </div>
                <ul className="text-sm space-y-1 ml-5 list-disc">
                  <li>Welcome bonus XP</li>
                  <li>Premium features access</li>
                  <li>Community support</li>
                </ul>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Benefits Info */}
        {!validated && (
          <div className="bg-purple-50 rounded-lg p-4 space-y-2">
            <h4 className="font-semibold text-purple-900 flex items-center gap-2">
              <Gift className="w-4 h-4" />
              Referral Benefits
            </h4>
            <ul className="text-sm text-purple-800 space-y-1 ml-5 list-disc">
              <li>Get bonus XP to start your journey</li>
              <li>Unlock special features faster</li>
              <li>Join a supportive faith community</li>
              <li>Help your friend earn rewards too!</li>
            </ul>
          </div>
        )}

        {/* Skip Option */}
        {!validated && (
          <p className="text-xs text-muted-foreground text-center">
            Don't have a code? You can skip this step and join anyway.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default ReferralInvite;