import { connectionMongo, getMongoModel } from '../../common/mongo';

const { Schema } = connectionMongo;

export type AdminOperationTaskSchema = {
  _id: string;
  type: string;
  targetType: string;
  targetId: string;
  targetName: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  progress: number;
  currentStep?: string;
  error?: string;
  payload?: Record<string, string>;
  operatorId: string;
  ip?: string;
  idempotencyKey: string;
  activeKey?: string;
  createTime: Date;
  updateTime: Date;
};

const AdminOperationTask = new Schema({
  type: { type: String, required: true },
  targetType: { type: String, required: true },
  targetId: { type: String, required: true },
  targetName: { type: String, required: true },
  status: {
    type: String,
    enum: ['queued', 'running', 'succeeded', 'failed'],
    default: 'queued',
    required: true
  },
  progress: { type: Number, default: 0 },
  currentStep: String,
  error: String,
  payload: { type: Object },
  operatorId: { type: String, required: true },
  ip: String,
  idempotencyKey: { type: String, required: true, unique: true },
  activeKey: { type: String },
  createTime: { type: Date, default: () => new Date() },
  updateTime: { type: Date, default: () => new Date() }
});

AdminOperationTask.index({ status: 1, createTime: -1 });
AdminOperationTask.index({ targetType: 1, targetId: 1, createTime: -1 });
AdminOperationTask.index({ activeKey: 1 }, { unique: true, sparse: true });

export const MongoAdminOperationTask = getMongoModel<AdminOperationTaskSchema>(
  'admin_operation_tasks',
  AdminOperationTask
);
