import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import { deleteCollaborators, listCollaborator, updateCollaborators } from '../controller';
import { MongoDataset } from '../../../core/dataset/schema';
import { UpdateDatasetCollaboratorBody } from '@fastgpt/global/core/dataset/collaborator';

export async function updateDatasetCollaborators(
  updateDatasetCollaboratorBody: UpdateDatasetCollaboratorBody
) {
  const { datasetId, tmbIds, permission } = updateDatasetCollaboratorBody;

  const dataset = await MongoDataset.findById(datasetId).lean();
  if (!dataset) {
    return Promise.reject(AppErrEnum.unExist);
  }

  await updateCollaborators(
    { tmbIds, permission },
    PerResourceTypeEnum.dataset,
    datasetId,
    dataset.teamId
  );
}

export async function listDatasetCollaborator(datasetId: string): Promise<CollaboratorItemType[]> {
  const dataset = await MongoDataset.findById(datasetId).lean();
  if (!dataset) {
    return Promise.reject(AppErrEnum.unExist);
  }
  return await listCollaborator(PerResourceTypeEnum.dataset, datasetId, dataset.teamId);
}

export async function deleteDatasetCollaborators(datasetId: string, tmbId: string) {
  const dataset = await MongoDataset.findById(datasetId).lean();
  if (!dataset) {
    return Promise.reject(AppErrEnum.unExist);
  }
  await deleteCollaborators(PerResourceTypeEnum.dataset, datasetId, dataset.teamId, tmbId);
}
