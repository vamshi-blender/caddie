import "server-only";

import { randomUUID } from "node:crypto";
import {
  decryptOracleConfig,
  encryptOracleConfig,
  type OracleDatabaseConfig,
} from "@/lib/oracle/config";
import { getDatabase } from "./supabase";

interface DatabaseConfigRow {
  encrypted_config: string;
  config_version: string;
  updated_at: string;
}

export interface ActiveDatabaseConfig {
  config: OracleDatabaseConfig;
  version: string;
  updatedAt: string;
}

export async function getActiveDatabaseConfig(): Promise<ActiveDatabaseConfig | null> {
  const { data, error } = await getDatabase()
    .from("application_database_config")
    .select("encrypted_config, config_version, updated_at")
    .eq("id", 1)
    .maybeSingle<DatabaseConfigRow>();

  if (error) {
    throw new Error(`Could not load the database configuration: ${error.message}`);
  }
  if (!data) return null;

  return {
    config: decryptOracleConfig(data.encrypted_config),
    version: data.config_version,
    updatedAt: data.updated_at,
  };
}

export async function saveActiveDatabaseConfig(
  config: OracleDatabaseConfig,
  updatedBy: string,
): Promise<ActiveDatabaseConfig> {
  const version = randomUUID();
  const updatedAt = new Date().toISOString();
  const encryptedConfig = encryptOracleConfig(config);

  const { data, error } = await getDatabase()
    .from("application_database_config")
    .upsert(
      {
        id: 1,
        encrypted_config: encryptedConfig,
        config_version: version,
        updated_by: updatedBy,
        updated_at: updatedAt,
      },
      { onConflict: "id" },
    )
    .select("encrypted_config, config_version, updated_at")
    .single<DatabaseConfigRow>();

  if (error) {
    throw new Error(`Could not save the database configuration: ${error.message}`);
  }

  return {
    config: decryptOracleConfig(data.encrypted_config),
    version: data.config_version,
    updatedAt: data.updated_at,
  };
}
