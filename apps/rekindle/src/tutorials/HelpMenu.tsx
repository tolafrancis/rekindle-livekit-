// The Help (?) button in the app header: replay the app tour, learn about the
// current screen, browse tutorials, read the FAQ, or search for a feature.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HelpCircle, PlayCircle, MapPin, Library, MessageCircleQuestion, Compass, BookOpenText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FaqList } from '@rekindle/features/components/FaqList';
import { useTutorials } from '@rekindle/features/tutorial/TutorialProvider';
import { FEATURE_FINDER_OPEN_EVENT } from '@/components/FeatureFinder';
import { INTRO_TUTORIAL_ID } from './definitions';

export const HelpMenu: React.FC<{ className?: string }> = ({ className }) => {
  const { start, tutorialForPage, currentPage, setLibraryOpen, tr } = useTutorials();
  const navigate = useNavigate();
  const [faqOpen, setFaqOpen] = useState(false);
  const h = (key: string, fallback: string) => tr(`help.${key}`, fallback);
  const pageTutorial = tutorialForPage(currentPage);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            data-tour="help-button"
            aria-label={h('button', 'Help')}
            title={h('button', 'Help')}
            className={className}
          >
            <HelpCircle className="h-4 w-4 md:h-5 md:w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>{h('title', 'Help')}</DropdownMenuLabel>
          <DropdownMenuItem className="gap-2 py-2.5" onClick={() => start(INTRO_TUTORIAL_ID, { restart: true })}>
            <PlayCircle className="h-4 w-4 text-purple-600" />{h('appTour', 'Start App Tour')}
          </DropdownMenuItem>
          {pageTutorial && pageTutorial.id !== INTRO_TUTORIAL_ID && (
            <DropdownMenuItem className="gap-2 py-2.5" onClick={() => start(pageTutorial.id, { restart: true })}>
              <MapPin className="h-4 w-4 text-purple-600" />
              <span className="min-w-0">
                {h('thisPage', 'Learn About This Page')}
                <span className="block truncate text-xs text-gray-500">{tr(`${pageTutorial.id}.title`, pageTutorial.title)}</span>
              </span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className="gap-2 py-2.5" onClick={() => setLibraryOpen(true)}>
            <Library className="h-4 w-4 text-purple-600" />{h('browse', 'Browse Tutorials')}
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2 py-2.5" onClick={() => setFaqOpen(true)}>
            <MessageCircleQuestion className="h-4 w-4 text-purple-600" />{h('faq', 'Frequently Asked Questions')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2 py-2.5" onClick={() => window.dispatchEvent(new CustomEvent(FEATURE_FINDER_OPEN_EVENT))}>
            <Compass className="h-4 w-4 text-gray-500" />{h('findFeature', 'Find a feature')}
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2 py-2.5" onClick={() => navigate('/tutorial')}>
            <BookOpenText className="h-4 w-4 text-gray-500" />{h('guide', 'Full illustrated guide')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={faqOpen} onOpenChange={setFaqOpen}>
        <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{h('faq', 'Frequently Asked Questions')}</DialogTitle>
            <DialogDescription>
              {h('faqHint', 'Answers to common questions. Still stuck? Try Find a feature or browse the tutorials.')}
            </DialogDescription>
          </DialogHeader>
          <FaqList />
        </DialogContent>
      </Dialog>
    </>
  );
};
