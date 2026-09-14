import { connectionMongo, getMongoModel } from '../../common/mongo';

const { Schema } = connectionMongo;

export type AdminAuditLogSchema = {
  _id: string;
  operatorId: string;
  event: string;
  targetType: string;
  targetId: string;
  targetName: string;
  success: boolean;
  error?: string;
  ip?: string;
  taskId?: string;
  changes?: Record<string, string>;
  createTime: Date;
};

const AdminAuditLog = new Schema({
  operatorId: { type: String, required: true },
  event: { type: String, required: true },
  targetType: { type: String, required: true },
  targetId: { type: String, required: true },
  targetName: { type: String, required: true },
  success: { type: Boolean, required: true },
  error: String,
  ip: String,
  taskId: String,
  changes: { type: Object },
  createTime: { type: Date, default: () => new Date() }
});

AdminAuditLog.index({ createTime: -1 });
AdminAuditLog.index({ targetType: 1, targetId: 1, createTime: -1 });

export const MongoAdminAuditLog = getMongoModel<AdminAuditLogSchema>(
  'admin_audit_logs',
  AdminAuditLog
);
