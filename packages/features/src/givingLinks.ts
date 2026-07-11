// Single source of truth for PayPal giving / partnership links.
// Used by both the public LandingPage and the in-app SponsorshipSystem so the
// two never drift. Update a link here and it changes everywhere.
export const PAYPAL_LINKS = {
  custom:    'https://www.paypal.com/ncp/payment/3YK4A327MGDEY',
  oneTime:   'https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-4WW211734T869610RNIWUNVA',
  monthly50: 'https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-7P8586509X755242HNIWUDQY',
  monthly25: 'https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-73A12474PE1925450NIWT65I',
} as const;
