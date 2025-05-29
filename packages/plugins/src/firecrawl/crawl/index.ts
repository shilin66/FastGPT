import FirecrawlApp from '@mendable/firecrawl-js';
import type { CrawlParams, CrawlScrapeOptions } from '@mendable/firecrawl-js/src';
import { addLog } from '@fastgpt/service/common/system/log';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { filterEmptyObject } from '../clean';

type Props = CrawlParams & {
  apiKey?: string;
  apiUrl: string;
  url: string;
};
type Response = Promise<{
  result: any;
}>;

const main = async (props: Props): Response => {
  try {
    const { apiKey, apiUrl, url, ...crawlParams } = filterEmptyObject(props);

    const app = new FirecrawlApp({
      apiKey,
      apiUrl
    });
    if (props.scrapeOptions) {
      props.scrapeOptions = filterEmptyObject(props.scrapeOptions) as CrawlScrapeOptions;
    }

    const crawlResponse = await app.crawlUrl(url, crawlParams);

    if (!crawlResponse.success) {
      addLog.error(`Failed to crawl: ${crawlResponse.error}`);
      return {
        result: getErrText(`Failed to crawl: ${crawlResponse.error}`)
      };
    }

    return {
      result: crawlResponse
    };
  } catch (e) {
    addLog.error(`Failed to crawl: ${e}`);
    return {
      result: getErrText(e, 'Failed to crawl')
    };
  }
};

export default main;
