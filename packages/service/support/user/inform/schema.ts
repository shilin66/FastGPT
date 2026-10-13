import { Schema } from 'mongoose';
import { getMongoModel } from '../../../common/mongo';
import type { SystemMsgModalValueType } from './type';

const collectionName = 'system_msg';
const LicenseExpiryReminderSchema = new Schema(
  {
    enabled: { type: Boolean, required: true },
    templates: { '30': String, '15': String, '7': String }
  },
  { _id: false }
);
const LicenseExpiryStateSchema = new Schema(
  { configurationId: String, id: String, expiresAt: String },
  { _id: false }
);

const SystemMsgSchema = new Schema({
  id: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  licenseExpiryReminder: { type: LicenseExpiryReminderSchema },
  licenseExpiryState: { type: LicenseExpiryStateSchema }
});

export const MongoSystemMsg = getMongoModel<SystemMsgModalValueType>(
  collectionName,
  SystemMsgSchema
);
