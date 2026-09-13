export type CentralRbacAssignmentRecord = {
  externalAssignmentId: string;
  externalSubjectId: string;
  organizationExternalId: string;
  roleCode?: string;
  permissionCodes?: string[];
  sourceKey: string;
  sourceRevision: string;
  expiresAt?: string | null;
  revoked: boolean;
};

export interface CentralRbacProvider {
  sourceKey: string;
  validate(records: CentralRbacAssignmentRecord[]): void;
}
