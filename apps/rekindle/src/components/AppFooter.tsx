import React from 'react';
import { QuickLanguageSelector } from './LanguageSettings';

interface AppFooterProps {
  onNavigate?: (tab: string) => void;
}

/**
 * Application-wide footer. The language switcher lives here (rather than the top
 * nav) since most people set it once and rarely change it.
 */
export const AppFooter: React.FC<AppFooterProps> = ({ onNavigate }) => {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-12 border-t border-gray-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-center sm:text-left">
          <span className="text-lg font-serif font-bold text-purple-700">ReKindled</span>
          <span className="hidden sm:inline text-gray-300">·</span>
          <span className="text-xs text-gray-500">Igniting spiritual growth, empowering believers.</span>
        </div>

        <div className="flex items-center gap-4">
          {onNavigate && (
            <button
              onClick={() => onNavigate('profile')}
              className="text-xs text-gray-500 hover:text-purple-700 transition-colors"
            >
              Settings
            </button>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 hidden sm:inline">Language</span>
            <QuickLanguageSelector />
          </div>
        </div>
      </div>
      <div className="border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 py-3 text-center text-xs text-gray-400">
          © {year} ReKindle Media Outreach. All rights reserved.
        </div>
      </div>
    </footer>
  );
};

export default AppFooter;
