import { Schema } from 'mongoose';
import { getMongoModel } from '../../../common/mongo';
import type { SystemMsgModalValueType } from './type';

const collectionName = 'system_msg';

const SystemMsgSchema = new Schema({
  id: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  }
});

export const MongoSystemMsg = getMongoModel<SystemMsgModalValueType>(
  collectionName,
  SystemMsgSchema
);
