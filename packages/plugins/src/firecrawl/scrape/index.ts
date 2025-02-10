import FirecrawlApp from '@mendable/firecrawl-js';
import { ScrapeParams } from '@mendable/firecrawl-js/src';
import { addLog } from '@fastgpt/service/common/system/log';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { filterEmptyObject } from '../clean';

type Props = ScrapeParams & {
  apiKey?: string;
  apiUrl: string;
  url: string;
};
type Response = Promise<{
  result: any;
}>;

const main = async (props: Props): Response => {
  try {
    if (props.extract) {
      props.extract = filterEmptyObject(props.extract);
    }

    const { apiKey, apiUrl, url, ...scrapeParams } = filterEmptyObject(props);
    const app = new FirecrawlApp({
      apiKey,
      apiUrl
    });
    const scrapeResponse = await app.scrapeUrl(url, scrapeParams as ScrapeParams);

    if (!scrapeResponse.success) {
      addLog.error(`Failed to scrape: ${scrapeResponse.error}`);
      return {
        result: getErrText(`Failed to scrape: ${scrapeResponse.error} ${scrapeResponse}`)
      };
    }

    return {
      result: scrapeResponse
    };
  } catch (e) {
    addLog.error(`Failed to scrape: ${e}`);
    return {
      result: getErrText(e, 'Failed to scrape')
    };
  }
};

export default main;
