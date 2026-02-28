import { replaceS3KeyToPreviewUrl } from '../../../core/dataset/utils';
import { addEndpointToImageUrl } from '../../../common/file/image/utils';
import { addDays } from 'date-fns';
import { isS3ObjectKey, jwtSignS3ObjectKey } from '../../../common/s3/utils';
import type { DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';

export const formatDatasetDataValue = ({
  q,
  a,
  summary,
  imageId,
  imageDescMap
}: {
  q: string;
  a?: string;
  summary?: string;
  imageId?: string;
  imageDescMap?: Record<string, string>;
}): {
  q: string;
  a?: string;
  summary?: string;
  imagePreivewUrl?: string;
} => {
  // Add image description to image markdown
  if (imageDescMap) {
    // Helper function to replace image markdown with description
    const replaceImageMarkdown = (text: string): string => {
      return text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, altText, url) => {
        const description = imageDescMap[url];
        if (description) {
          // Add description to alt text, keeping original if exists
          const newAltText = altText ? `${altText} - ${description}` : description;
          return `![${newAltText.replace(/\n/g, '')}](${url})`;
        }
        return match; // Return original if no description found
      });
    };

    // Apply replacement to both q and a
    q = replaceImageMarkdown(q);
    if (a) {
      a = replaceImageMarkdown(a);
    }
  }

  // Add image base url
  q = addEndpointToImageUrl(q);
  if (a) {
    a = addEndpointToImageUrl(a);
  }

  if (!imageId) {
    return {
      q: replaceS3KeyToPreviewUrl(q, addDays(new Date(), 90)),
      a: a ? replaceS3KeyToPreviewUrl(a, addDays(new Date(), 90)) : undefined
    };
  }

  const imagePreivewUrl = isS3ObjectKey(imageId, 'dataset')
    ? jwtSignS3ObjectKey(imageId, addDays(new Date(), 90))
    : imageId;

  return {
    q,
    a,
    summary,
    imagePreivewUrl
  };
};

export const getFormatDatasetCiteList = (list: DatasetDataSchemaType[]) => {
  return list.map((item) => {
    const summaryIndex = item.indexes.find(
      (data) => data.type === DatasetDataIndexTypeEnum.summary
    );
    const summary = summaryIndex ? summaryIndex.text : '';

    return {
      _id: item._id,
      ...formatDatasetDataValue({
        q: item.q,
        a: item.a,
        summary,
        imageId: item.imageId
      }),
      history: item.history,
      updateTime: item.updateTime,
      index: item.chunkIndex
    };
  });
};
