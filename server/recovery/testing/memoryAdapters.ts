import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import type {
  DatabaseRecoveryAdapter,
  StorageKeyMapping,
  StorageRecoveryAdapter,
  StorageReference,
} from "../types";

const CRITICAL_TABLES = [
  "users",
  "user_profiles",
  "teams",
  "incidents",
  "incident_assignments",
  "incident_evidence",
  "audit_logs",
] as const;

interface MemoryDatabaseState {
  tableCounts: Record<string, number>;
  references: StorageReference[];
  invariants: Record<string, number>;
}

export interface SyntheticRecoverySourceOptions {
  users: number;
  profiles: number;
  teams: number;
  incidents: number;
  assignments: number;
  evidence: Buffer;
  auditLogs: number;
}

export interface MemoryRecoverySnapshot {
  tableCounts: Record<string, number>;
  references: StorageReference[];
  objectHashes: Record<string, string>;
  invariants: Record<string, number>;
}

function emptyTableCounts(): Record<string, number> {
  return Object.fromEntries(CRITICAL_TABLES.map(table => [table, 0]));
}

function cloneState(state: MemoryDatabaseState): MemoryDatabaseState {
  return {
    tableCounts: { ...state.tableCounts },
    references: state.references.map(reference => ({ ...reference })),
    invariants: { ...state.invariants },
  };
}

class MemoryDatabaseAdapter implements DatabaseRecoveryAdapter {
  private state: MemoryDatabaseState;
  private readonly invariantOverrides: Record<string, number> = {};

  constructor(initialState: MemoryDatabaseState) {
    this.state = cloneState(initialState);
  }

  async exportTo(destination: string): Promise<void> {
    await writeFile(destination, JSON.stringify(this.state));
  }

  async restoreFrom(source: string): Promise<void> {
    const restored = JSON.parse(
      await readFile(source, "utf8")
    ) as MemoryDatabaseState;
    this.state = cloneState(restored);
  }

  async isEmpty(): Promise<boolean> {
    return Object.values(this.state.tableCounts).every(count => count === 0);
  }

  async countCriticalTables(): Promise<Record<string, number>> {
    return { ...this.state.tableCounts };
  }

  async listStorageReferences(): Promise<StorageReference[]> {
    return this.state.references.map(reference => ({ ...reference }));
  }

  async replaceStorageReferences(mappings: StorageKeyMapping[]): Promise<void> {
    const byOriginalKey = new Map(
      mappings.map(mapping => [mapping.originalKey, mapping.restoredKey])
    );
    this.state.references = this.state.references.map(reference => {
      const restoredKey = byOriginalKey.get(reference.key);
      return restoredKey ? { ...reference, key: restoredKey } : reference;
    });
  }

  async verifyInvariants(): Promise<Record<string, number>> {
    return { ...this.state.invariants, ...this.invariantOverrides };
  }

  clear(): void {
    this.state = {
      tableCounts: emptyTableCounts(),
      references: [],
      invariants: {
        orphanEvidence: 0,
        orphanAssignments: 0,
        brokenProfiles: 0,
      },
    };
  }

  seedNonEmpty(): void {
    this.state.tableCounts.users = 1;
  }

  setInvariantOverride(name: string, value: number): void {
    this.invariantOverrides[name] = value;
  }

  snapshot(): MemoryDatabaseState {
    return cloneState({
      ...this.state,
      invariants: { ...this.state.invariants, ...this.invariantOverrides },
    });
  }
}

class MemoryStorageAdapter implements StorageRecoveryAdapter {
  readonly objects: Map<string, Buffer>;

  constructor(
    initialObjects: Map<string, Buffer>,
    private readonly targetPrefix: string
  ) {
    this.objects = new Map(
      [...initialObjects].map(([key, bytes]) => [key, Buffer.from(bytes)])
    );
  }

  async download(key: string, destination: string): Promise<void> {
    const bytes = this.objects.get(key);
    if (!bytes) throw new Error("controlled storage object is unavailable");
    await writeFile(destination, bytes);
  }

  async upload(
    originalKey: string,
    source: string,
    _contentType: string
  ): Promise<string> {
    if (!this.targetPrefix) {
      throw new Error("controlled source storage cannot upload");
    }
    const restoredKey = `${this.targetPrefix}/${originalKey.replace(/^\/+/, "")}`;
    this.objects.set(restoredKey, await readFile(source));
    return restoredKey;
  }

  delete(key: string): void {
    this.objects.delete(key);
  }

  clear(): void {
    this.objects.clear();
  }
}

function normalizeRestoredKey(key: string): string {
  return key.replace(/^recovery-drills\/d005\//, "");
}

function snapshot(
  database: MemoryDatabaseAdapter,
  storage: MemoryStorageAdapter
): MemoryRecoverySnapshot {
  const databaseSnapshot = database.snapshot();
  const objectHashes = Object.fromEntries(
    [...storage.objects.entries()]
      .map(([key, bytes]) => [
        normalizeRestoredKey(key),
        createHash("sha256").update(bytes).digest("hex"),
      ])
      .sort(([left], [right]) => left.localeCompare(right))
  );
  return {
    tableCounts: databaseSnapshot.tableCounts,
    references: databaseSnapshot.references
      .map(reference => ({
        ...reference,
        key: normalizeRestoredKey(reference.key),
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    objectHashes,
    invariants: databaseSnapshot.invariants,
  };
}

export function createSyntheticRecoverySource(
  options: SyntheticRecoverySourceOptions
) {
  const evidenceKey = "incident-evidence/1/evidence.bin";
  const avatarKey = "profile-photos/1/avatar.png";
  const avatar = Buffer.from("synthetic avatar");
  const references: StorageReference[] = [
    {
      table: "incident_evidence",
      rowId: 1,
      column: "storage_key",
      key: evidenceKey,
      contentType: "application/octet-stream",
      expectedByteSize: options.evidence.byteLength,
    },
    {
      table: "user_profiles",
      rowId: 1,
      column: "avatar_storage_key",
      key: avatarKey,
      contentType: "image/png",
      expectedByteSize: null,
    },
  ];
  const database = new MemoryDatabaseAdapter({
    tableCounts: {
      users: options.users,
      user_profiles: options.profiles,
      teams: options.teams,
      incidents: options.incidents,
      incident_assignments: options.assignments,
      incident_evidence: 1,
      audit_logs: options.auditLogs,
    },
    references,
    invariants: {
      orphanEvidence: 0,
      orphanAssignments: 0,
      brokenProfiles: 0,
    },
  });
  const storage = new MemoryStorageAdapter(
    new Map([
      [evidenceKey, options.evidence],
      [avatarKey, avatar],
    ]),
    ""
  );
  return {
    database,
    storage,
    deleteObject: (key: string) => storage.delete(key),
    snapshot: () => snapshot(database, storage),
  };
}

export function createEmptyRecoveryTarget() {
  const database = new MemoryDatabaseAdapter({
    tableCounts: emptyTableCounts(),
    references: [],
    invariants: {
      orphanEvidence: 0,
      orphanAssignments: 0,
      brokenProfiles: 0,
    },
  });
  const storage = new MemoryStorageAdapter(new Map(), "recovery-drills/d005");
  return {
    database,
    storage,
    clearDisposableData: () => {
      database.clear();
      storage.clear();
    },
    seedNonEmpty: () => database.seedNonEmpty(),
    setInvariantOverride: (name: string, value: number) =>
      database.setInvariantOverride(name, value),
    snapshot: () => snapshot(database, storage),
  };
}
