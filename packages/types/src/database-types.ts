// =====================================================
// PLATFORM ADMIN SAAS - TYPESCRIPT TYPES
// Auto-generated types matching Supabase schema
// =====================================================

export type PlatformAdminRole = 'super_admin' | 'finance' | 'compliance' | 'support';

export type MinistryStatus = 'pending' | 'approved' | 'suspended' | 'archived';

export type MinistryVerificationStatus = 'unverified' | 'pending_documents' | 'verified' | 'rejected';

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'suspended';

export type TransactionType = 
  | 'subscription_charge'
  | 'subscription_refund'
  | 'donation_fee'
  | 'payout'
  | 'payout_reversal'
  | 'overage_charge'
  | 'credit'
  | 'adjustment';

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'reversed';

export type ContentType = 'post' | 'comment' | 'video' | 'message' | 'profile' | 'other';

export type ReporterType = 'user' | 'automated' | 'platform_admin';

export type ReasonCategory = 
  | 'harassment'
  | 'hate_speech'
  | 'violence'
  | 'spam'
  | 'misinformation'
  | 'copyright'
  | 'inappropriate_content'
  | 'other';

export type ModerationStatus = 'pending' | 'reviewing' | 'approved' | 'removed' | 'dismissed';

export type Priority = 'low' | 'normal' | 'high' | 'critical' | 'urgent';

export type TicketCategory = 'billing' | 'technical' | 'feature_request' | 'bug' | 'account' | 'other';

export type TicketStatus = 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';

export type SenderType = 'ministry' | 'platform_admin';

export type ActorType = 'platform_admin' | 'ministry_admin' | 'system';

export type AnnouncementType = 'info' | 'warning' | 'maintenance' | 'feature' | 'critical';

export type TargetAudience = 'all' | 'specific_ministries' | 'subscription_tier';

// =====================================================
// DATABASE TABLES
// =====================================================

export interface PlatformAdmin {
  id: string;
  user_id: string;
  email: string;
  role: PlatformAdminRole;
  permissions_json: Record<string, any>;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Ministry {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  zip_code: string | null;
  
  // Onboarding & Status
  status: MinistryStatus;
  verification_status: MinistryVerificationStatus;
  verification_documents: any[];
  verification_notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  suspended_by: string | null;
  suspended_at: string | null;
  suspension_reason: string | null;
  
  // Subscription
  subscription_plan_id: string | null;
  subscription_status: SubscriptionStatus;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  trial_ends_at: string | null;
  
  // Usage Limits
  storage_limit_mb: number;
  api_calls_limit: number;
  live_minutes_limit: number;
  members_limit: number;
  
  // Compliance
  terms_accepted_at: string | null;
  privacy_accepted_at: string | null;
  compliance_notes: string | null;
  violation_count: number;
  last_violation_at: string | null;
  
  // Metadata
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  
  // Feature Limits
  storage_limit_mb: number;
  api_calls_limit: number;
  live_minutes_limit: number;
  members_limit: number;
  
  // Feature Flags
  features: Record<string, any>;
  
  // Plan Status
  is_active: boolean;
  is_featured: boolean;
  display_order: number;
  
  created_at: string;
  updated_at: string;
}

export interface MinistryWhiteLabelSettings {
  id: string;
  ministry_id: string;
  
  // Branding
  brand_name: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string;
  accent_color: string;
  background_color: string;
  text_color: string;
  
  // Domain
  custom_domain: string | null;
  subdomain: string | null;
  domain_verified: boolean;
  
  // Email Branding
  email_sender_name: string | null;
  email_sender_domain: string | null;
  email_footer_text: string | null;
  email_logo_url: string | null;
  
  // Custom Content
  custom_css: string | null;
  custom_js: string | null;
  footer_links: any[];
  
  created_at: string;
  updated_at: string;
}

export interface MinistryUsageMetrics {
  id: string;
  ministry_id: string;
  
  // Current Period
  period_start: string;
  period_end: string;
  
  // Usage
  storage_used_mb: number;
  api_calls_count: number;
  live_minutes_used: number;
  members_count: number;
  
  // Detailed Breakdowns
  storage_breakdown: Record<string, number>;
  api_breakdown: Record<string, number>;
  
  // Limits
  storage_limit_mb: number | null;
  api_calls_limit: number | null;
  live_minutes_limit: number | null;
  members_limit: number | null;
  
  // Warnings
  storage_warning_sent: boolean;
  api_warning_sent: boolean;
  live_warning_sent: boolean;
  members_warning_sent: boolean;
  
  last_reset_at: string;
  created_at: string;
  updated_at: string;
}

export interface PlatformBillingLedger {
  id: string;
  ministry_id: string;
  
  // Transaction Details
  transaction_type: TransactionType;
  
  // Amounts
  gross_amount: number;
  platform_fee: number;
  net_amount: number;
  currency: string;
  
  // Period & Reference
  billing_period_start: string | null;
  billing_period_end: string | null;
  reference_id: string | null;
  reference_type: string | null;
  
  // Status
  status: PaymentStatus;
  payment_method: string | null;
  
  // Metadata
  description: string | null;
  metadata: Record<string, any>;
  
  created_at: string;
  updated_at: string;
}

export interface FlaggedContent {
  id: string;
  ministry_id: string;
  
  // Content Reference
  content_type: ContentType;
  content_id: string;
  content_url: string | null;
  content_snapshot: any | null;
  
  // Reporting
  reported_by: string | null;
  reporter_type: ReporterType;
  reason: string;
  reason_category: ReasonCategory | null;
  additional_context: string | null;
  
  // Moderation
  status: ModerationStatus;
  assigned_to: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  moderator_notes: string | null;
  action_taken: string | null;
  
  // Resolution
  resolution: string | null;
  ministry_notified: boolean;
  ministry_notified_at: string | null;
  appeal_requested: boolean;
  appeal_notes: string | null;
  
  // Priority
  priority: Priority;
  auto_flagged: boolean;
  
  created_at: string;
  updated_at: string;
}

export interface SupportTicket {
  id: string;
  ministry_id: string;
  
  // Ticket Details
  title: string;
  description: string;
  category: TicketCategory | null;
  priority: Priority;
  
  // Status
  status: TicketStatus;
  
  // Assignment
  assigned_to: string | null;
  created_by: string;
  
  // Tracking
  first_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  
  // Metadata
  tags: string[];
  attachments: any[];
  
  created_at: string;
  updated_at: string;
}

export interface SupportTicketMessage {
  id: string;
  ticket_id: string;
  
  // Sender
  sender_id: string;
  sender_type: SenderType;
  sender_name: string | null;
  
  // Message
  message: string;
  attachments: any[];
  
  // Metadata
  is_internal: boolean;
  
  created_at: string;
}

export interface AuditLog {
  id: string;
  
  // Actor
  actor_id: string;
  actor_type: ActorType;
  actor_email: string | null;
  
  // Action
  action: string;
  entity_type: string;
  entity_id: string | null;
  
  // Target
  target_ministry_id: string | null;
  
  // Details
  old_values: any | null;
  new_values: any | null;
  metadata: Record<string, any>;
  
  // Context
  ip_address: string | null;
  user_agent: string | null;
  
  created_at: string;
}

export interface PlatformAnnouncement {
  id: string;
  
  // Announcement Details
  title: string;
  message: string;
  announcement_type: AnnouncementType | null;
  
  // Targeting
  target_audience: TargetAudience;
  target_ministry_ids: string[];
  target_subscription_plans: string[];
  
  // Scheduling
  publish_at: string;
  expire_at: string | null;
  
  // Display
  is_dismissible: boolean;
  show_on_login: boolean;
  priority: number;
  
  // Status
  is_active: boolean;
  
  // Author
  created_by: string | null;
  
  created_at: string;
  updated_at: string;
}

export interface AnnouncementReadStatus {
  id: string;
  announcement_id: string;
  ministry_id: string;
  user_id: string;
  read_at: string;
  dismissed_at: string | null;
}

// =====================================================
// VIEWS
// =====================================================

export interface MinistryOverview {
  id: string;
  name: string;
  slug: string;
  email: string;
  status: MinistryStatus;
  subscription_status: SubscriptionStatus;
  subscription_plan: string | null;
  price_monthly: number | null;
  storage_used_mb: number | null;
  storage_limit_mb: number | null;
  api_calls_count: number | null;
  api_calls_limit: number | null;
  live_minutes_used: number | null;
  live_minutes_limit: number | null;
  members_count: number | null;
  members_limit: number | null;
  storage_usage_percent: number | null;
  api_usage_percent: number | null;
  created_at: string;
  trial_ends_at: string | null;
}

export interface PlatformRevenueSummary {
  month: string;
  transaction_type: TransactionType;
  transaction_count: number;
  total_gross: number;
  total_platform_fee: number;
  total_net: number;
  currency: string;
}

// =====================================================
// FUNCTION RETURN TYPES
// =====================================================

export interface UsageLimitCheck {
  current_usage: number;
  limit: number;
  percentage: number;
  is_over_limit: boolean;
  is_near_limit: boolean;
}

// =====================================================
// API REQUEST/RESPONSE TYPES
// =====================================================

export interface ApproveMinistryRequest {
  ministry_id: string;
  subscription_plan_id: string;
  notes?: string;
}

export interface SuspendMinistryRequest {
  ministry_id: string;
  reason: string;
  notify_ministry: boolean;
}

export interface UpdateWhiteLabelRequest {
  ministry_id: string;
  brand_name?: string;
  logo_url?: string;
  primary_color?: string;
  accent_color?: string;
  custom_domain?: string;
  subdomain?: string;
}

export interface CreateTicketRequest {
  ministry_id: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority: Priority;
  attachments?: any[];
}

export interface AddTicketMessageRequest {
  ticket_id: string;
  message: string;
  is_internal?: boolean;
  attachments?: any[];
}

export interface FlagContentRequest {
  ministry_id: string;
  content_type: ContentType;
  content_id: string;
  reason: string;
  reason_category: ReasonCategory;
  additional_context?: string;
}

export interface ModerateContentRequest {
  flagged_content_id: string;
  status: ModerationStatus;
  action_taken: string;
  moderator_notes?: string;
  notify_ministry: boolean;
}

export interface CreateAnnouncementRequest {
  title: string;
  message: string;
  announcement_type: AnnouncementType;
  target_audience: TargetAudience;
  target_ministry_ids?: string[];
  target_subscription_plans?: string[];
  publish_at?: string;
  expire_at?: string;
  is_dismissible?: boolean;
  show_on_login?: boolean;
  priority?: number;
}

export interface BillingTransaction {
  ministry_id: string;
  transaction_type: TransactionType;
  gross_amount: number;
  platform_fee?: number;
  net_amount: number;
  currency?: string;
  billing_period_start?: string;
  billing_period_end?: string;
  reference_id?: string;
  reference_type?: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface UsageUpdate {
  ministry_id: string;
  storage_used_mb?: number;
  api_calls_count?: number;
  live_minutes_used?: number;
  members_count?: number;
}

// =====================================================
// DASHBOARD STATS TYPES
// =====================================================

export interface PlatformStats {
  total_ministries: number;
  active_ministries: number;
  pending_approval: number;
  suspended_ministries: number;
  total_revenue_monthly: number;
  total_revenue_yearly: number;
  total_users: number;
  total_storage_used_gb: number;
  open_tickets: number;
  pending_flags: number;
}

export interface MinistryDashboardStats {
  current_usage: {
    storage: UsageLimitCheck;
    api_calls: UsageLimitCheck;
    live_minutes: UsageLimitCheck;
    members: UsageLimitCheck;
  };
  billing_summary: {
    current_month_charges: number;
    outstanding_balance: number;
    next_billing_date: string;
  };
  recent_activity: {
    new_members: number;
    total_donations: number;
    live_sessions: number;
  };
}

// =====================================================
// FILTER & QUERY TYPES
// =====================================================

export interface MinistryFilters {
  status?: MinistryStatus[];
  subscription_status?: SubscriptionStatus[];
  subscription_plan_id?: string[];
  verification_status?: MinistryVerificationStatus[];
  created_after?: string;
  created_before?: string;
  search?: string;
}

export interface TicketFilters {
  status?: TicketStatus[];
  category?: TicketCategory[];
  priority?: Priority[];
  assigned_to?: string;
  ministry_id?: string;
  created_after?: string;
  created_before?: string;
}

export interface AuditLogFilters {
  actor_type?: ActorType[];
  action?: string[];
  entity_type?: string[];
  target_ministry_id?: string;
  date_from?: string;
  date_to?: string;
}

export interface BillingFilters {
  ministry_id?: string;
  transaction_type?: TransactionType[];
  status?: PaymentStatus[];
  date_from?: string;
  date_to?: string;
  min_amount?: number;
  max_amount?: number;
}

// =====================================================
// PAGINATION & SORTING
// =====================================================

export interface PaginationParams {
  page: number;
  per_page: number;
}

export interface SortParams {
  sort_by: string;
  sort_order: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    per_page: number;
    total_items: number;
    total_pages: number;
  };
}

// =====================================================
// EXPORT TYPES
// =====================================================

export interface ExportOptions {
  format: 'csv' | 'xlsx' | 'pdf';
  date_range?: {
    start: string;
    end: string;
  };
  filters?: any;
  columns?: string[];
}

// =====================================================
// NOTIFICATION TYPES
// =====================================================

export interface NotificationPayload {
  type: 'email' | 'in_app' | 'sms';
  recipient_id: string;
  recipient_email?: string;
  recipient_phone?: string;
  subject?: string;
  message: string;
  template?: string;
  data?: Record<string, any>;
}

// =====================================================
// WEBHOOK TYPES
// =====================================================

export interface WebhookEvent {
  event_type: string;
  ministry_id: string;
  data: any;
  timestamp: string;
}

// =====================================================
// ERROR TYPES
// =====================================================

export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

export interface ValidationError {
  field: string;
  message: string;
}

// =====================================================
// PERMISSION TYPES
// =====================================================

export interface AdminPermissions {
  can_approve_ministries: boolean;
  can_suspend_ministries: boolean;
  can_view_billing: boolean;
  can_manage_billing: boolean;
  can_view_audit_logs: boolean;
  can_moderate_content: boolean;
  can_manage_support: boolean;
  can_manage_announcements: boolean;
  can_manage_plans: boolean;
  can_export_data: boolean;
}

// =====================================================
// HELPER TYPES
// =====================================================

export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

