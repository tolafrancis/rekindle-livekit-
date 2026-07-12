import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from '@/components/ui/use-toast';
import { Star, Loader2, Heart, MessageSquare } from 'lucide-react';

interface SessionRatingModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  counsellorId: string;
  counsellorName: string;
  onRatingSubmitted?: () => void;
}

export const SessionRatingModal: React.FC<SessionRatingModalProps> = ({
  isOpen,
  onClose,
  sessionId,
  counsellorId,
  counsellorName,
  onRatingSubmitted
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const ratingLabels = [
    '',
    t('sessionRatingModal', 'ratingPoor', 'Poor - Did not meet expectations'),
    t('sessionRatingModal', 'ratingFair', 'Fair - Below average experience'),
    t('sessionRatingModal', 'ratingGood', 'Good - Met expectations'),
    t('sessionRatingModal', 'ratingVeryGood', 'Very Good - Above average'),
    t('sessionRatingModal', 'ratingExcellent', 'Excellent - Exceeded expectations')
  ];

  const handleSubmit = async () => {
    if (!user?.id || rating === 0) {
      toast({
        title: t('sessionRatingModal', 'selectRatingTitle', 'Please select a rating'),
        description: t('sessionRatingModal', 'selectRatingDesc', 'Choose between 1 and 5 stars'),
        variant: 'destructive'
      });
      return;
    }

    setSubmitting(true);
    try {
      // Insert the review
      const { error: reviewError } = await supabase
        .from('counsellor_reviews')
        .insert({
          session_id: sessionId,
          counsellor_id: counsellorId,
          user_id: user.id,
          rating,
          review_text: reviewText.trim() || null,
          is_anonymous: isAnonymous,
          created_at: new Date().toISOString()
        });

      if (reviewError) throw reviewError;

      // Update counsellor's average rating
      const { data: allReviews } = await supabase
        .from('counsellor_reviews')
        .select('rating')
        .eq('counsellor_id', counsellorId)
        .eq('is_visible', true);

      if (allReviews && allReviews.length > 0) {
        const avgRating = allReviews.reduce((acc, r) => acc + r.rating, 0) / allReviews.length;
        
        await supabase
          .from('counsellors')
          .update({ rating: Math.round(avgRating * 10) / 10 })
          .eq('id', counsellorId);
      }

      toast({
        title: t('sessionRatingModal', 'thankYouTitle', 'Thank you for your feedback!'),
        description: t('sessionRatingModal', 'thankYouDesc', 'Your review has been submitted successfully.')
      });

      onRatingSubmitted?.();
      onClose();
    } catch (err: any) {
      console.error('Failed to submit review:', err);
      toast({
        title: t('sessionRatingModal', 'errorTitle', 'Error'),
        description: t('sessionRatingModal', 'submitFailedDesc', 'Failed to submit your review. Please try again.'),
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setRating(0);
    setHoverRating(0);
    setReviewText('');
    setIsAnonymous(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-pink-500" />
            {t('sessionRatingModal', 'rateYourSession', 'Rate Your Session')}
          </DialogTitle>
          <DialogDescription>
            {t('sessionRatingModal', 'howWasSession', 'How was your counselling session with {name}?').replace('{name}', String(counsellorName))}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Star Rating */}
          <div className="text-center">
            <div className="flex justify-center gap-2 mb-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="focus:outline-none transition-transform hover:scale-110"
                >
                  <Star
                    className={`h-10 w-10 transition-colors ${
                      star <= (hoverRating || rating)
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-gray-300 hover:text-amber-200'
                    }`}
                  />
                </button>
              ))}
            </div>
            <p className="text-sm text-gray-600 h-5">
              {ratingLabels[hoverRating || rating] || t('sessionRatingModal', 'selectARating', 'Select a rating')}
            </p>
          </div>

          {/* Review Text */}
          <div>
            <Label className="flex items-center gap-2 mb-2">
              <MessageSquare className="h-4 w-4" />
              {t('sessionRatingModal', 'writeReviewLabel', 'Write a Review (Optional)')}
            </Label>
            <Textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder={t('sessionRatingModal', 'reviewPlaceholder', 'Share your experience with this counsellor...')}
              rows={4}
              maxLength={1000}
            />
            <p className="text-xs text-gray-400 mt-1 text-right">
              {t('sessionRatingModal', 'charactersCount', '{count}/1000 characters').replace('{count}', String(reviewText.length))}
            </p>
          </div>

          {/* Anonymous Toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <Label className="font-medium">{t('sessionRatingModal', 'submitAnonymously', 'Submit Anonymously')}</Label>
              <p className="text-xs text-gray-500">{t('sessionRatingModal', 'anonymousHint', "Your name won't be shown with the review")}</p>
            </div>
            <Switch
              checked={isAnonymous}
              onCheckedChange={setIsAnonymous}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose}>
            {t('sessionRatingModal', 'skipForNow', 'Skip for Now')}
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={submitting || rating === 0}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('sessionRatingModal', 'submitting', 'Submitting...')}
              </>
            ) : (
              t('sessionRatingModal', 'submitReview', 'Submit Review')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SessionRatingModal;
