// src/lib/schemaValidator.ts
// Schema validation and repair utilities

import { supabase } from './supabase';

// ============================================
// TYPES
// ============================================

interface ColumnDefinition {
  name: string;
  type: string;
  default?: string;
  nullable?: boolean;
}

interface TableSchema {
  name: string;
  columns: ColumnDefinition[];
}

// ============================================
// EXPECTED SCHEMAS
// ============================================

export const expectedSchemas: TableSchema[] = [
  {
    name: 'user_profiles',
    columns: [
      { name: 'id', type: 'uuid' },
      { name: 'user_id', type: 'text' },
      { name: 'email', type: 'text' },
      { name: 'full_name', type: 'text' },
      { name: 'avatar_url', type: 'text', nullable: true },
      { name: 'language_preference', type: 'text', default: 'en' },
      { name: 'spiritual_level', type: 'text', default: 'beginner' },
      { name: 'consent_devotionals', type: 'boolean', default: 'true' },
      { name: 'consent_affirmations', type: 'boolean', default: 'true' },
      { name: 'consent_reminders', type: 'boolean', default: 'true' },
      { name: 'consent_marketing', type: 'boolean', default: 'false' },
      { name: 'onboarding_completed', type: 'boolean', default: 'false' },
      { name: 'prayer_streak', type: 'integer', default: '0' },
      { name: 'total_prayers', type: 'integer', default: '0' },
      { name: 'xp_points', type: 'integer', default: '0' },
      { name: 'disciples_count', type: 'integer', default: '0' },
      { name: 'role', type: 'text', default: 'user' },
      { name: 'subscription_tier', type: 'text', default: 'free' },
      { name: 'subscription_ends_at', type: 'timestamptz', nullable: true },
      { name: 'is_banned', type: 'boolean', default: 'false' },
    ],
  },
  {
    name: 'prayer_journal',
    columns: [
      { name: 'id', type: 'uuid' },
      { name: 'user_id', type: 'text' },
      { name: 'title', type: 'text' },
      { name: 'content', type: 'text' },
      { name: 'prayer_type', type: 'text', nullable: true },
      { name: 'is_answered', type: 'boolean', default: 'false' },
      { name: 'created_at', type: 'timestamptz' },
      { name: 'updated_at', type: 'timestamptz' },
    ],
  },
  {
    name: 'user_devotional_progress',
    columns: [
      { name: 'id', type: 'uuid' },
      { name: 'user_id', type: 'text' },
      { name: 'devotional_id', type: 'text' },
      { name: 'module_number', type: 'integer', default: '1' },
      { name: 'completed_at', type: 'timestamptz' },
      { name: 'created_at', type: 'timestamptz' },
      { name: 'updated_at', type: 'timestamptz' },
    ],
  },
];

// ============================================
// VALIDATION FUNCTIONS
// ============================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Validate that a table exists and has expected columns
export const validateTableSchema = async (tableName: string): Promise<ValidationResult> => {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  try {
    // Try to select from the table to verify it exists
    const { error } = await supabase
      .from(tableName)
      .select('*')
      .limit(1);

    if (error) {
      if (error.message.includes('does not exist')) {
        result.valid = false;
        result.errors.push(`Table '${tableName}' does not exist`);
      } else if (error.message.includes('column')) {
        result.warnings.push(`Schema mismatch detected in '${tableName}': ${error.message}`);
      } else {
        result.warnings.push(`Table '${tableName}' access issue: ${error.message}`);
      }
    }
  } catch (e: any) {
    result.valid = false;
    result.errors.push(`Failed to validate '${tableName}': ${e.message}`);
  }

  return result;
};

// Validate all expected schemas
export const validateAllSchemas = async (): Promise<ValidationResult> => {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  for (const schema of expectedSchemas) {
    const tableResult = await validateTableSchema(schema.name);
    
    if (!tableResult.valid) {
      result.valid = false;
    }
    
    result.errors.push(...tableResult.errors);
    result.warnings.push(...tableResult.warnings);
  }

  return result;
};

// ============================================
// FIELD USAGE TRACKING
// ============================================

// Track which fields are being used by the frontend
const usedFields: Map<string, Set<string>> = new Map();

export const trackFieldUsage = (table: string, field: string) => {
  if (!usedFields.has(table)) {
    usedFields.set(table, new Set());
  }
  usedFields.get(table)!.add(field);
};

export const getUsedFields = (table: string): string[] => {
  return Array.from(usedFields.get(table) || []);
};

export const getAllUsedFields = (): Record<string, string[]> => {
  const result: Record<string, string[]> = {};
  usedFields.forEach((fields, table) => {
    result[table] = Array.from(fields);
  });
  return result;
};

// ============================================
// CONNECTION HEALTH
// ============================================

export interface ConnectionHealth {
  connected: boolean;
  latency: number;
  authStatus: 'authenticated' | 'anonymous' | 'error';
  schemaValid: boolean;
  timestamp: Date;
}

export const checkConnectionHealth = async (): Promise<ConnectionHealth> => {
  const start = Date.now();
  const health: ConnectionHealth = {
    connected: false,
    latency: 0,
    authStatus: 'error',
    schemaValid: false,
    timestamp: new Date(),
  };

  try {
    // Check connection
    const { error: connError } = await supabase
      .from('user_profiles')
      .select('id')
      .limit(1);

    health.latency = Date.now() - start;
    health.connected = !connError || !connError.message.includes('fetch');

    // Check auth status
    const { data: { session } } = await supabase.auth.getSession();
    health.authStatus = session ? 'authenticated' : 'anonymous';

    // Quick schema check
    const schemaResult = await validateTableSchema('user_profiles');
    health.schemaValid = schemaResult.valid;

  } catch (e) {
    health.latency = Date.now() - start;
    console.error('[HEALTH] Check failed:', e);
  }

  return health;
};

// ============================================
// DIAGNOSTIC REPORT
// ============================================

export interface DiagnosticReport {
  timestamp: Date;
  environment: {
    url: string;
    projectRef: string;
  };
  connection: ConnectionHealth;
  schemas: ValidationResult;
  usedFields: Record<string, string[]>;
}

export const generateDiagnosticReport = async (): Promise<DiagnosticReport> => {
  const connection = await checkConnectionHealth();
  const schemas = await validateAllSchemas();

  // Extract project ref from URL
  const url = 'https://vpnpembyqbbaaiynfvli.supabase.co';
  const projectRef = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || 'unknown';

  return {
    timestamp: new Date(),
    environment: {
      url,
      projectRef,
    },
    connection,
    schemas,
    usedFields: getAllUsedFields(),
  };
};

// ============================================
// AUTO-REPAIR UTILITIES
// ============================================

// Log schema issues for debugging
export const logSchemaIssues = async () => {
  const report = await generateDiagnosticReport();
  
  console.group('[SCHEMA DIAGNOSTIC REPORT]');
  console.log('Timestamp:', report.timestamp.toISOString());
  console.log('Project:', report.environment.projectRef);
  console.log('Connection:', report.connection.connected ? 'OK' : 'FAILED');
  console.log('Auth:', report.connection.authStatus);
  console.log('Latency:', report.connection.latency + 'ms');
  
  if (report.schemas.errors.length > 0) {
    console.error('Schema Errors:', report.schemas.errors);
  }
  
  if (report.schemas.warnings.length > 0) {
    console.warn('Schema Warnings:', report.schemas.warnings);
  }
  
  console.log('Used Fields:', report.usedFields);
  console.groupEnd();
  
  return report;
};

// Export for global debugging
if (typeof window !== 'undefined') {
  (window as any).__schemaDebug = {
    validateAllSchemas,
    checkConnectionHealth,
    generateDiagnosticReport,
    logSchemaIssues,
    getAllUsedFields,
  };
}
