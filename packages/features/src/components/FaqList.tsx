import React, { useEffect, useMemo, useState } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@rekindle/ui/accordion';
import { fetchFaqItems, type FaqAudience, type FaqItem } from '../faq';
import { useLanguage } from '../LanguageContext';

type Filter = 'all' | Exclude<FaqAudience, 'general'>;

/**
 * FAQ accordion with an audience filter. "Everyone" questions show under every
 * filter; Individuals / Ministry leaders narrow to their own plus those.
 * Renders nothing while loading or if there are no published items.
 */
export const FaqList: React.FC<{ initialFilter?: Filter; className?: string }> = ({ initialFilter = 'all', className }) => {
  const { t } = useLanguage();
  const [items, setItems] = useState<FaqItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>(initialFilter);

  useEffect(() => {
    let cancelled = false;
    fetchFaqItems()
      .then((rows) => { if (!cancelled) setItems(rows); })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(() => {
    if (!items) return [];
    const rank: Record<FaqAudience, number> = { general: 0, individual: 1, ministry: 2 };
    return items
      .filter((i) => filter === 'all' || i.audience === 'general' || i.audience === filter)
      .sort((a, b) => rank[a.audience] - rank[b.audience] || a.display_order - b.display_order);
  }, [items, filter]);

  if (!items || items.length === 0) return null;

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: t('faq', 'filterAll', 'All') },
    { id: 'individual', label: t('faq', 'filterIndividual', 'Individuals') },
    { id: 'ministry', label: t('faq', 'filterMinistry', 'Ministry leaders') },
  ];

  return (
    <div className={className}>
      <div className="mb-6 flex flex-wrap gap-2" role="tablist">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === f.id ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700 hover:bg-violet-100'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <Accordion type="single" collapsible className="w-full">
        {visible.map((item) => (
          <AccordionItem key={item.id} value={item.id}>
            <AccordionTrigger className="text-left text-base">{item.question}</AccordionTrigger>
            <AccordionContent className="whitespace-pre-line text-[0.95rem] leading-relaxed text-gray-600">
              {item.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
};

export default FaqList;
