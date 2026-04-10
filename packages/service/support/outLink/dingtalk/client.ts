import { axios } from '../../../common/api/axios';

export const sendDingtalkTextBySessionWebhook = async ({
  sessionWebhook,
  markdown
}: {
  sessionWebhook: string;
  markdown: string;
}) => {
  return axios.post(
    sessionWebhook,
    {
      msgtype: 'markdown',
      markdown: {
        title: markdown.slice(0, 10),
        text: markdown
      }
    },
    {
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
};
