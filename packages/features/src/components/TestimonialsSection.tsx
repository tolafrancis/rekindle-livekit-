import React, { useEffect, useState } from 'react';
import { fetchTestimonials, type AppTestimonial } from '../testimonials';
import { useLanguage } from '../LanguageContext';

/** Landing-page testimonials (app_testimonials, 0412). Renders nothing while
 *  loading or until at least one testimonial is published. */
export const TestimonialsSection: React.FC = () => {
  const { t } = useLanguage();
  const [items, setItems] = useState<AppTestimonial[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchTestimonials()
      .then((rows) => { if (!cancelled) setItems(rows.slice(0, 6)); })
      .catch(() => { /* table missing or offline: show nothing */ });
    return () => { cancelled = true; };
  }, []);

  if (items.length === 0) return null;

  return (
    <section id="testimonials" style={{ background: '#fdf9f3', padding: '100px 0' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>
        <p style={{ fontSize: '.78rem', fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: '#7c3aed', marginBottom: 12, textAlign: 'center' }}>{t('landing', 'testimonialsEyebrow', 'Testimonials')}</p>
        <h2 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 'clamp(2rem,4vw,3.2rem)', color: '#0f0a1e', marginBottom: 40, textAlign: 'center' }}>{t('landing', 'testimonialsTitle', 'What people are saying')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 20 }}>
          {items.map((item) => (
            <figure key={item.id} style={{ margin: 0, background: '#fff', border: '1px solid rgba(124,58,237,.12)', borderRadius: 16, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <blockquote style={{ margin: 0, color: '#2d2440', fontSize: '1.02rem', lineHeight: 1.7, flex: 1 }}>“{item.quote}”</blockquote>
              <figcaption>
                <span style={{ display: 'block', fontWeight: 600, color: '#0f0a1e' }}>{item.name}</span>
                {item.role && <span style={{ display: 'block', fontSize: '.88rem', color: '#6b6280' }}>{item.role}</span>}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
