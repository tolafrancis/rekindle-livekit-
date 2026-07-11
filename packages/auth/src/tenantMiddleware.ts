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

    // Get user's ministry membership
    const { data: membership } = await supabase
      .from('ministry_group_members')
      .select('group_id, role, is_leader')
      .eq('user_id', userId)
      .single();

    // Also check if user owns any ministry
    const { data: ownedMinistry } = await supabase
      .from('ministry_groups')
      .select('id')
      .or(`owner_id.eq.${userId},leader_id.eq.${userId}`)
      .single();

    const ministryId = membership?.group_id || ownedMinistry?.id || null;
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
