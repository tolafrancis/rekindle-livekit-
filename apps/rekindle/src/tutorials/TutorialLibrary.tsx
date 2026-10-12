// The Rekindle shell's tutorial library: the shared one, in Rekindle's
// category order.
import React from 'react';
import { TutorialLibrary as SharedTutorialLibrary } from '@rekindle/features/tutorial/TutorialLibrary';
import { TUTORIAL_CATEGORIES } from './definitions';

export const TutorialLibrary: React.FC = () => <SharedTutorialLibrary categories={TUTORIAL_CATEGORIES} />;
