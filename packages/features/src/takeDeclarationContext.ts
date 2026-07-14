import { createContext, useContext } from 'react';

// Lets a host (e.g. the ministry app) provide a "go to today's declaration" handler
// that ANY DevotionalModule rendered in its subtree will use instead of the default
// route navigation (navigate('/home') + scroll to #daily-declaration). The ministry
// space is tab-based, not route-based, so it supplies its own handler.
export const TakeDeclarationContext = createContext<(() => void) | null>(null);

export const useTakeDeclarationHandler = (): (() => void) | null =>
  useContext(TakeDeclarationContext);
