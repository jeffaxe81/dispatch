export const RECOVERY_FORMAT_VERSION = 1 as const;

export type RecoverySourceClass = "synthetic" | "non-production";
export type StorageReferenceTable = "incident_evidence" | "user_profiles";

export interface StorageReference {
  table: StorageReferenceTable;
  rowId: number;
  column: "storage_key" | "avatar_storage_key";
  key: string;
  contentType: string;
  expectedByteSize: number | null;
}

export interface StorageKeyMapping {
  originalKey: string;
  restoredKey: string;
  references: StorageReference[];
}

export interface RecoveryArtifact {
  kind: "database" | "object";
  relativePath: string;
  logicalKey: string | null;
  contentType: string;
  byteSize: number;
  plaintextSha256: string;
  encryptedSha256: string;
  references: StorageReference[];
}

export interface RecoveryManifest {
  formatVersion: typeof RECOVERY_FORMAT_VERSION;
  id: string;
  createdAt: string;
  appVersion: string;
  schemaVersion: string;
  sourceClass: RecoverySourceClass;
  sourceLabel: string;
  status: "complete" | "invalid";
  tableCounts: Record<string, number>;
  artifacts: RecoveryArtifact[];
}

export interface RecoveryEnvelope {
  formatVersion: typeof RECOVERY_FORMAT_VERSION;
  id: string;
  createdAt: string;
  status: "complete" | "invalid";
  encryptedManifestPath: `manifests/${string}.enc`;
  encryptedManifestSha256: string;
}

export interface RecoveryStorageConfig {
  apiUrl: string;
  apiKey: string;
  prefix: string;
}

export type RecoveryConfig =
  | {
      command: "backup";
      sourceClass: RecoverySourceClass;
      sourceDatabaseUrl: string;
      sourceStorage: RecoveryStorageConfig;
      encryptionKey: Buffer;
    }
  | {
      command: "restore" | "verify";
      targetDatabaseUrl: string;
      targetStorage: RecoveryStorageConfig;
      encryptionKey: Buffer;
    };

export interface RecoveryVerificationReport {
  runId: string;
  status: "approved" | "rejected";
  rpoMs: number;
  rtoMs: number;
  tableCounts: Record<string, number>;
  objectCount: number;
  failedChecks: string[];
}

export interface DatabaseRecoveryAdapter {
  exportTo(destination: string): Promise<void>;
  restoreFrom(source: string): Promise<void>;
  isEmpty(): Promise<boolean>;
  countCriticalTables(): Promise<Record<string, number>>;
  listStorageReferences(): Promise<StorageReference[]>;
  replaceStorageReferences(mappings: StorageKeyMapping[]): Promise<void>;
  verifyInvariants(): Promise<Record<string, number>>;
}

export interface StorageRecoveryAdapter {
  download(key: string, destination: string): Promise<void>;
  upload(
    originalKey: string,
    source: string,
    contentType: string
  ): Promise<string>;
}
