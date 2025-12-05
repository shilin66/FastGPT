import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import type {
  CollaboratorItemType,
  CollaboratorListType
} from '@fastgpt/global/support/permission/collaborator';
import { deleteCollaborators, listCollaborator, updateCollaborators } from '../controller';
import { MongoDataset } from '../../../core/dataset/schema';
import type { UpdateDatasetCollaboratorBody } from '@fastgpt/global/core/dataset/collaborator';

export async function updateDatasetCollaborators(
  updateDatasetCollaboratorBody: UpdateDatasetCollaboratorBody
) {
  const { datasetId, collaborators } = updateDatasetCollaboratorBody;

  const dataset = await MongoDataset.findById(datasetId).lean();
  if (!dataset) {
    return Promise.reject(AppErrEnum.unExist);
  }

  await updateCollaborators(
    { collaborators },
    PerResourceTypeEnum.dataset,
    datasetId,
    dataset.teamId
  );
}

export async function listDatasetCollaborator(datasetId: string): Promise<CollaboratorListType> {
  const dataset = await MongoDataset.findById(datasetId).lean();
  if (!dataset) {
    return Promise.reject(AppErrEnum.unExist);
  }
  if (dataset.parentId) {
    const parentDataset = await MongoDataset.findById(dataset.parentId).lean();
    return await listCollaborator(
      dataset.teamId,
      PerResourceTypeEnum.dataset,
      datasetId,
      dataset.tmbId,
      dataset.parentId,
      parentDataset?.tmbId
    );
  }
  return await listCollaborator(
    dataset.teamId,
    PerResourceTypeEnum.dataset,
    datasetId,
    dataset.tmbId
  );
}

export async function deleteDatasetCollaborators(
  datasetId: string,
  tmbId: string,
  groupId: string
) {
  const dataset = await MongoDataset.findById(datasetId).lean();
  if (!dataset) {
    return Promise.reject(AppErrEnum.unExist);
  }
  await deleteCollaborators(PerResourceTypeEnum.dataset, datasetId, dataset.teamId, tmbId, groupId);
}
