import type { UpdateAppCollaboratorBody } from '@fastgpt/global/core/app/collaborator';
import { MongoApp } from '../../../core/app/schema';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import {
  OwnerPermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import type { CollaboratorListType } from '@fastgpt/global/support/permission/collaborator';
import { deleteCollaborators, listCollaborator, updateCollaborators } from '../controller';
import { MongoResourcePermission } from '../schema';

export async function updateAppCollaborators(updateAppCollaboratorBody: UpdateAppCollaboratorBody) {
  const { appId, collaborators } = updateAppCollaboratorBody;

  const app = await MongoApp.findById(appId).lean();
  if (!app) {
    return Promise.reject(AppErrEnum.unExist);
  }

  await updateCollaborators({ collaborators }, PerResourceTypeEnum.app, appId, app.teamId);
}

export async function listAppCollaborator(appId: string): Promise<CollaboratorListType> {
  const app = await MongoApp.findById(appId).lean();
  if (!app) {
    return Promise.reject(AppErrEnum.unExist);
  }
  if (app.parentId) {
    const parentApp = await MongoApp.findById(app.parentId).lean();
    if (parentApp) {
      return await listCollaborator(
        app.teamId,
        PerResourceTypeEnum.app,
        appId,
        app.tmbId,
        app.parentId,
        parentApp.tmbId
      );
    }
  }
  return await listCollaborator(app.teamId, PerResourceTypeEnum.app, appId, app.tmbId);
}

export async function deleteAppCollaborators(appId: string, tmbId: string, groupId: string) {
  const app = await MongoApp.findById(appId).lean();
  if (!app) {
    return Promise.reject(AppErrEnum.unExist);
  }
  await deleteCollaborators(PerResourceTypeEnum.app, appId, app.teamId, tmbId, groupId);
}

export async function changeAppOwner(appId: string, ownerId: string) {
  await MongoResourcePermission.updateOne(
    {
      resourceType: PerResourceTypeEnum.app,
      resourceId: appId,
      permission: OwnerPermissionVal
    },
    {
      $set: {
        tmbId: ownerId
      }
    }
  );
  await MongoApp.updateOne({ _id: appId }, { tmbId: ownerId });
}
