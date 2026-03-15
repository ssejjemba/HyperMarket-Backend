import type { ValidationReport } from '../domain';

export type StoreConfig = {
  id: string;
  tenantId: string;
  status: 'draft' | 'active' | 'archived';
  templateId: string;
  templateVersion: string;
  configVersion: number;
  configPayload: Record<string, unknown>;
  validationReport: ValidationReport | null;
  createdByUserId: string;
  createdAt: Date;
};

export type CreateDraftConfigInput = {
  tenantId: string;
  templateId: string;
  templateVersion: string;
  configPayload: Record<string, unknown>;
  validationReport?: ValidationReport | null;
  createdByUserId: string;
};

export type UpdateDraftConfigInput = {
  tenantId: string;
  configId: string;
  configPayload: Record<string, unknown>;
  validationReport?: ValidationReport | null;
};

export type StoreConfigRepository = {
  createDraftConfig(input: CreateDraftConfigInput): Promise<StoreConfig>;
  getConfigById(tenantId: string, configId: string): Promise<StoreConfig | null>;
  listConfigs(tenantId: string): Promise<StoreConfig[]>;
  updateDraftConfig(input: UpdateDraftConfigInput): Promise<StoreConfig>;
  getActiveConfig(tenantId: string): Promise<StoreConfig | null>;
};
