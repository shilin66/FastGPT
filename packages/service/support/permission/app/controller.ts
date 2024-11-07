import { UpdateAppCollaboratorBody } from '@fastgpt/global/core/app/collaborator';
import { MongoApp } from '../../../core/app/schema';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import { deleteCollaborators, listCollaborator, updateCollaborators } from '../controller';

export async function updateAppCollaborators(updateAppCollaboratorBody: UpdateAppCollaboratorBody) {
  const { appId, members, groups, permission } = updateAppCollaboratorBody;

  const app = await MongoApp.findById(appId).lean();
  if (!app) {
    return Promise.reject(AppErrEnum.unExist);
  }

  await updateCollaborators(
    { members, groups, permission },
    PerResourceTypeEnum.app,
    appId,
    app.teamId
  );
}

export async function listAppCollaborator(appId: string): Promise<CollaboratorItemType[]> {
  const app = await MongoApp.findById(appId).lean();
  if (!app) {
    return Promise.reject(AppErrEnum.unExist);
  }
  return await listCollaborator(PerResourceTypeEnum.app, appId, app.teamId);
}

export async function deleteAppCollaborators(appId: string, tmbId: string, groupId: string) {
  const app = await MongoApp.findById(appId).lean();
  if (!app) {
    return Promise.reject(AppErrEnum.unExist);
  }
  await deleteCollaborators(PerResourceTypeEnum.app, appId, app.teamId, tmbId, groupId);
}

export async function changeAppOwner(appId: string, ownerId: string) {
  await MongoApp.updateOne({ _id: appId }, { tmbId: ownerId });
}
