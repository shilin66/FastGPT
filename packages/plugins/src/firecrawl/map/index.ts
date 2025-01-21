import FirecrawlApp from '@mendable/firecrawl-js';
import { MapParams } from '@mendable/firecrawl-js/src';
import { addLog } from '@fastgpt/service/common/system/log';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { hashStr } from '@fastgpt/global/common/string/tools';

type Props = MapParams & {
  apiKey?: string;
  apiUrl: string;
  url: string;
};
type Response = Promise<{
  result: any;
}>;

const main = async (props: Props): Response => {
  try {
    const { apiKey, apiUrl, url, ...mapParams } = props;
    const app = new FirecrawlApp({
      apiKey,
      apiUrl
    });
    const mapResponse = await app.mapUrl(url, mapParams);

    if (!mapResponse.success) {
      addLog.error(`Failed to map: ${mapResponse.error}`);
      return {
        result: getErrText(`Failed to map: ${mapResponse.error}`)
      };
    }

    return {
      result: mapResponse
    };
  } catch (e) {
    addLog.error(`Failed to map: ${e}`);
    return {
      result: getErrText(e, 'Failed to map')
    };
  }
};

export default main;
