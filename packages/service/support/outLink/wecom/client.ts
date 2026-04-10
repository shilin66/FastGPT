import { axios } from '../../../common/api/axios';

export const sendWecomMarkdownByResponseUrl = async ({
  responseUrl,
  markdown
}: {
  responseUrl: string;
  markdown: string;
}) => {
  return axios.post(
    responseUrl,
    {
      msgtype: 'markdown',
      markdown: {
        content: markdown
      }
    },
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      }
    }
  );
};
