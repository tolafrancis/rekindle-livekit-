// =====================================================
// MULTI-TENANCY ENFORCEMENT MIDDLEWARE
// Strict tenant isolation with Platform Admin bypass
// =====================================================

import { supabase } from '@rekindle/supabase';

export interface TenantContext {
  userId: string;
  ministryId: string | null;
  isPlatformAdmin: boolean;
  role: string;
  permissions: string[];
}

// Platform admin roles that bypass tenant restrictions
const PLATFORM_ADMIN_ROLES = ['super_admin', 'platform_admin'];

/**
 * Get tenant context for current user
 */
export async function getTenantContext(userId: string): Promise<TenantContext | null> {
  try {
    // Get user profile with role
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('role, email')
      .eq('user_id', userId)
      .single();

    if (error || !profile) return null;

    const isPlatformAdmin = PLATFORM_ADMIN_ROLES.includes(profile.role || '');

    // If platform admin, return with bypass
    if (isPlatformAdmin) {
      return {
        userId,
        ministryId: null,
        isPlatformAdmin: true,
        role: profile.role,
        permissions: ['*'] // All permissions
      };
    }

    // Get user's ministry membership. NOTE: a member can belong to MANY ministries
    // (multi-membership), so this must NOT use .single() (which throws on >1 row).
    // This legacy single-tenant context now returns the FIRST membership; the
    // authoritative "which ministry am I acting in" lives in CurrentMinistryProvider
    // (@rekindle/features). Prefer getUserMinistries() for the full list.
    const { data: membership } = await supabase
      .from('ministry_group_members')
      .select('group_id, ministry_id, role, is_leader')
      .eq('user_id', userId)
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    // Also check if user owns/leads any ministry
    const { data: ownedMinistry } = await supabase
      .from('ministry_groups')
      .select('id')
      .or(`owner_id.eq.${userId},leader_id.eq.${userId}`)
      .limit(1)
      .maybeSingle();

    const ministryId =
      membership?.group_id || membership?.ministry_id || ownedMinistry?.id || null;
    const role = membership?.role || (ownedMinistry ? 'admin' : 'user');

    return {
      userId,
      ministryId,
      isPlatformAdmin: false,
      role,
      permissions: getMinistryPermissions(role)
    };
  } catch (error) {
    console.error('[Tenant Middleware] Error getting context:', error);
    return null;
  }
}

/**
 * A ministry the current user belongs to (member, leader, or owner).
 * Feeds the ministry switcher + CurrentMinistryProvider (multi-membership).
 */
export interface MinistrySummary {
  id: string;
  name: string;
  role: string;
  isLeader: boolean;
  isOwner: boolean;
  logoUrl: string | null;
  themeColor: string | null;
}

/**
 * Full list of ministries a user can act in — memberships (ministry_group_members)
 * merged with ministries they own/lead (ministry_groups.owner_id/leader_id), deduped
 * by ministry id. `ministry_groups` is the canonical tenant table (see docs §3a).
 */
export async function getUserMinistries(userId: string): Promise<MinistrySummary[]> {
  try {
    const [{ data: memberships }, { data: owned }] = await Promise.all([
      supabase
        .from('ministry_group_members')
        .select('group_id, ministry_id, role, is_leader')
        .eq('user_id', userId),
      supabase
        .from('ministry_groups')
        .select('id, name, logo_url, theme_color, owner_id, leader_id')
        .or(`owner_id.eq.${userId},leader_id.eq.${userId}`),
    ]);

    const memberIds = Array.from(
      new Set((memberships || []).map((m) => m.group_id || m.ministry_id).filter(Boolean)),
    );

    let memberGroups: any[] = [];
    if (memberIds.length) {
      const { data } = await supabase
        .from('ministry_groups')
        .select('id, name, logo_url, theme_color, owner_id, leader_id')
        .in('id', memberIds as string[]);
      memberGroups = data || [];
    }

    const byId = new Map<string, MinistrySummary>();
    const put = (g: any, role: string) => {
      if (!g?.id || byId.has(g.id)) return;
      byId.set(g.id, {
        id: g.id,
        name: g.name,
        role,
        isLeader: g.leader_id === userId,
        isOwner: g.owner_id === userId,
        logoUrl: g.logo_url ?? null,
        themeColor: g.theme_color ?? null,
      });
    };

    // Owned/led first (highest privilege), then memberships.
    for (const g of owned || []) put(g, 'admin');
    for (const g of memberGroups) {
      const mem = (memberships || []).find((m) => (m.group_id || m.ministry_id) === g.id);
      put(g, mem?.role || 'member');
    }

    return Array.from(byId.values());
  } catch (error) {
    console.error('[Tenant Middleware] getUserMinistries error:', error);
    return [];
  }
}

/**
 * Get permissions based on ministry role
 */
function getMinistryPermissions(role: string): string[] {
  const permissionMap: Record<string, string[]> = {
    admin: ['read', 'write', 'delete', 'manage_members', 'manage_settings', 'view_billing'],
    moderator: ['read', 'write', 'manage_members'],
    member: ['read', 'write_own'],
    user: ['read']
  };
  
  return permissionMap[role] || permissionMap.user;
}

/**
 * Check if user has permission for a ministry action
 */
export async function checkMinistryPermission(
  userId: string,
  ministryId: string,
  permission: string
): Promise<boolean> {
  const context = await getTenantContext(userId);
  
  if (!context) return false;
  
  // Platform admins bypass all checks
  if (context.isPlatformAdmin) return true;
  
  // User must belong to the ministry they're trying to access
  if (context.ministryId !== ministryId) return false;
  
  // Check if user has required permission
  return context.permissions.includes(permission) || context.permissions.includes('*');
}

/**
 * Enforce tenant isolation in queries
 * Returns filtered query based on user's tenant context
 */
export async function enforceTenantIsolation<T>(
  tableName: string,
  userId: string,
  baseQuery?: any
): Promise<{ data: T[] | null; error: any; context: TenantContext | null }> {
  const context = await getTenantContext(userId);
  
  if (!context) {
    return { data: null, error: { message: 'Unauthorized' }, context: null };
  }

  let query = baseQuery || supabase.from(tableName).select('*');

  // Platform admins see everything
  if (context.isPlatformAdmin) {
    const { data, error } = await query;
    return { data, error, context };
  }

  // Regular users only see their ministry's data
  if (!context.ministryId) {
    return { data: [], error: null, context };
  }

  // Apply ministry filter
  query = query.eq('ministry_id', context.ministryId);

  const { data, error } = await query;
  return { data, error, context };
}

/**
 * Validate ministry access before write operations
 */
export async function validateMinistryAccess(
  userId: string,
  ministryId: string,
  operation: 'read' | 'write' | 'delete' | 'manage'
): Promise<{ allowed: boolean; reason?: string; context: TenantContext | null }> {
  const context = await getTenantContext(userId);
  
  if (!context) {
    return { allowed: false, reason: 'User not authenticated', context: null };
  }

  // Platform admins always allowed
  if (context.isPlatformAdmin) {
    return { allowed: true, context };
  }

  // Check if user belongs to this ministry
  if (context.ministryId !== ministryId) {
    return { 
      allowed: false, 
      reason: 'Access denied: You do not belong to this ministry', 
      context 
    };
  }

  // Check operation permission
  const permissionMap: Record<string, string[]> = {
    read: ['read', 'write', 'delete', 'manage_members', '*'],
    write: ['write', 'delete', 'manage_members', '*'],
    delete: ['delete', '*'],
    manage: ['manage_members', 'manage_settings', '*']
  };

  const requiredPermissions = permissionMap[operation] || [];
  const hasPermission = context.permissions.some(p => requiredPermissions.includes(p));

  if (!hasPermission) {
    return {
      allowed: false,
      reason: `Permission denied: ${operation} operation requires higher privileges`,
      context
    };
  }

  return { allowed: true, context };
}

/**
 * Get all ministries user can access (for Platform Admins or multi-ministry users)
 */
export async function getUserAccessibleMinistries(userId: string): Promise<string[]> {
  const context = await getTenantContext(userId);
  
  if (!context) return [];
  
  // Platform admins see all ministries
  if (context.isPlatformAdmin) {
    const { data } = await supabase
      .from('ministries')
      .select('id')
      .eq('status', 'approved');
    
    return (data || []).map(m => m.id);
  }

  // Regular users see only their ministries
  const { data: memberships } = await supabase
    .from('ministry_group_members')
    .select('group_id')
    .eq('user_id', userId);

  const { data: ownedMinistries } = await supabase
    .from('ministry_groups')
    .select('id')
    .or(`owner_id.eq.${userId},leader_id.eq.${userId}`);

  const membershipIds = (memberships || []).map(m => m.group_id);
  const ownedIds = (ownedMinistries || []).map(m => m.id);

  return [...new Set([...membershipIds, ...ownedIds])];
}

/**
 * Audit log helper for tenant actions
 */
export async function logTenantAction(
  userId: string,
  ministryId: string | null,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata?: any
): Promise<void> {
  try {
    const context = await getTenantContext(userId);
    
    await supabase.from('audit_logs').insert({
      actor_id: userId,
      actor_type: context?.isPlatformAdmin ? 'platform_admin' : 'ministry_admin',
      action,
      entity_type: resourceType,
      entity_id: resourceId,
      target_ministry_id: ministryId,
      new_values: metadata,
      metadata: {
        timestamp: new Date().toISOString(),
        user_role: context?.role
      }
    });
  } catch (error) {
    console.error('[Tenant Middleware] Failed to log action:', error);
  }
}
