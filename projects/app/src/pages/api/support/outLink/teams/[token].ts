import {
  Activity,
  ActivityHandler,
  ActivityTypes,
  CardFactory,
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
  MessageFactory,
  TurnContext
} from 'botbuilder';
import axios from 'axios';
import { NextApiRequest, NextApiResponse } from 'next';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<any> {
  const token = req.query.token;
  if (!token || typeof token !== 'string') {
    return Promise.reject('no token');
  }
  const outLink = await MongoOutLink.findOne({
    shareId: token,
    type: PublishChannelEnum.teams
  });

  if (!outLink) {
    return Promise.reject('no shareId');
  }

  const botConfig = outLink.app;

  const botFrameworkAuthentication = new ConfigurationBotFrameworkAuthentication(botConfig);
  const adapter = new CloudAdapter(botFrameworkAuthentication);

  const streamBot = new TeamsStreamingBot(token, outLink.appId);
  const responseProxy = {
    ...res,
    end: () => {
      res.end();
    },
    header: (name: string, value: string) => res.setHeader(name, value),
    headersSent: false
  };
  await adapter.process(req, responseProxy, (context) => streamBot.run(context));
}

const StreamType = {
  Informative: 'Informative',
  Streaming: 'Streaming',
  Final: 'Final'
};

interface ChannelData {
  streamId?: string;
  streamType: string;
  streamSequence: number;
}

class TeamsStreamingBot extends ActivityHandler {
  abortController: AbortController;
  shareId: string;
  appId: string;
  constructor(shareId: string, appId: string) {
    super();
    this.abortController = new AbortController();
    this.shareId = shareId;
    this.appId = appId;
  }

  async onMessageActivity(turnContext: TurnContext) {
    this.abortController = new AbortController();
    const userInput = turnContext.activity.text;
    try {
      let contentBuilder = '';
      let finalContentBuilder = '';
      let reasonContentBuilder = '';
      let streamSequence = 1;
      const rps = 1000;

      const channelData: ChannelData = {
        streamType: StreamType.Informative,
        streamSequence: streamSequence
      };

      channelData.streamId = await this.buildAndSendStreamingActivity(
        turnContext,
        channelData,
        'Getting the information...'
      );

      const response = await axios.post(
        `http://localhost:3000/api/v1/chat/completions`,
        {
          appId: this.appId,
          messages: [
            {
              role: 'user',
              content: userInput
            }
          ],
          stream: true,
          detail: true,
          shareId: this.shareId,
          outLinkUid: turnContext.activity.from.name,
          chatId: turnContext.activity.from.name
        },
        {
          responseType: 'stream',
          signal: this.abortController.signal
        }
      );

      const stopwatch = new Date();

      if (response.status !== 200) {
        await turnContext.sendActivity(`HTTP error! status: ${response.status}`);
        this.abortController.abort();
        return;
      } else {
        channelData.streamType = StreamType.Streaming;
        for await (const chunk of response.data) {
          if (this.abortController.signal.aborted) {
            return;
          }
          let event = '';
          let dataStr = '';
          let text = new TextDecoder('utf-8').decode(chunk);
          console.log('text>>>>>', text);
          const lines = text.split('\n').filter((line) => line.trim() !== '');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('event: ')) {
              event = lines[i].replace('event:', '').trim();
              i++;
            }
            if (lines[i].startsWith('data: ')) {
              dataStr = lines[i].replace('data:', '').trim();
            }

            if (event.trim() === SseResponseEventEnum.error) {
              const jsonLine = JSON.parse(dataStr);
              await turnContext.sendActivity(
                jsonLine.message || 'An error occurred on parse chunk.'
              );
              this.abortController.abort();
              return;
            }

            if (event.trim() === SseResponseEventEnum.flowResponses) {
              channelData.streamType = StreamType.Final;
              channelData.streamSequence = ++streamSequence;
              if (contentBuilder.length === 0) {
                contentBuilder = 'AI model response is empty';
              }
              await this.buildAndSendStreamingActivity(
                turnContext,
                channelData,
                contentBuilder,
                reasonContentBuilder,
                finalContentBuilder
              );
              break;
            }

            if (event.trim() === SseResponseEventEnum.answer) {
              if (dataStr.trim() === '[DONE]') {
                if (contentBuilder.length > 0) {
                  channelData.streamSequence = ++streamSequence;
                  await this.buildAndSendStreamingActivity(
                    turnContext,
                    channelData,
                    contentBuilder
                  );
                  stopwatch.setTime(new Date().getTime());
                }
                continue;
              }
              const jsonLine = JSON.parse(dataStr);
              const message = jsonLine.choices[0];
              if (message.delta.reasoning_content) {
                reasonContentBuilder += message.delta.reasoning_content;
                contentBuilder += message.delta.reasoning_content;
              }
              if (message.delta.content) {
                contentBuilder += message.delta.content;
                finalContentBuilder += message.delta.content;
              }

              if (contentBuilder.length > 0 && new Date().getTime() - stopwatch.getTime() > rps) {
                streamSequence++;
                channelData.streamSequence = ++streamSequence;
                await this.buildAndSendStreamingActivity(turnContext, channelData, contentBuilder);
                stopwatch.setTime(new Date().getTime());
              }
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Fetch request was aborted');
        return;
      }
      await turnContext.sendActivity(error.message || 'An error occurred during streaming.');
    } finally {
      if (!this.abortController.signal.aborted) {
        this.abortController.abort();
      }
    }
  }

  async buildAndSendStreamingActivity(
    turnContext: TurnContext,
    channelData: ChannelData,
    typingContent: string,
    reasonContent?: string,
    finalContent?: string
  ): Promise<string | undefined> {
    const isStreamFinal = channelData.streamType === StreamType.Final;
    const streamingActivity: any = {
      type: isStreamFinal ? 'message' : 'typing',
      id: channelData.streamId
    };

    if (typingContent) {
      streamingActivity.text = typingContent;
    }

    streamingActivity.entities = [
      {
        type: 'streaminfo',
        streamId: channelData.streamId,
        streamType: channelData.streamType.toString(),
        streamSequence: channelData.streamSequence
      }
    ];

    if (isStreamFinal && reasonContent) {
      try {
        streamingActivity.text = '';
        streamingActivity.attachments = [this.createFinalMessageCard(reasonContent)];
        await turnContext.updateActivity(streamingActivity);
        await turnContext.sendActivity({
          type: ActivityTypes.Message,
          text: finalContent
        });
      } catch (error) {
        console.error('Error creating adaptive card:', error);
        await turnContext.sendActivity('Error while generating the adaptive card.');
      }
      return;
    }

    return await this.sendStreamingActivity(turnContext, streamingActivity);
  }

  async sendStreamingActivity(
    turnContext: TurnContext,
    streamingActivity: Activity
  ): Promise<string | undefined> {
    try {
      const response = await turnContext.sendActivity(streamingActivity);
      return response?.id;
    } catch (error: any) {
      if (await this.isContentStreamNotAllowed(error)) {
        console.log(`用户停止了流式推送`);
        this.abortController.abort();
      } else {
        await turnContext.sendActivity(
          MessageFactory.text('Error while sending streaming activity: ' + error.message)
        );
        throw new Error('Error sending activity: ' + error.message);
      }
    }
  }

  async onInstallationUpdateActivity(turnContext: TurnContext) {
    if (turnContext.activity.conversation.conversationType === 'channel') {
      await turnContext.sendActivity(
        'Welcome to AI bot! Unfortunately, streaming is not yet available for channels or group chats.'
      );
    } else {
      await turnContext.sendActivity(
        "Welcome to AI bot! You can ask me a question and I'll do my best to answer it."
      );
    }
  }

  async isContentStreamNotAllowed(error: any) {
    return error.statusCode === 403 && error.code === 'ContentStreamNotAllowed';
  }

  private createFinalMessageCard(thinkingContent: string) {
    return CardFactory.adaptiveCard({
      type: 'AdaptiveCard',
      version: '1.5',
      body: [
        {
          type: 'ColumnSet',
          verticalContentAlignment: 'Center',
          columns: [
            {
              type: 'Column',
              width: 'auto',
              verticalContentAlignment: 'Center',
              items: [
                {
                  type: 'TextBlock',
                  text: '💭 思考过程',
                  weight: 'bolder',
                  spacing: 'medium',
                  color: 'accent'
                }
              ]
            },
            {
              type: 'Column',
              width: 'auto',
              verticalContentAlignment: 'Center',
              items: [
                {
                  type: 'Container',
                  id: 'collapseButtonContainer',
                  isVisible: false,
                  style: 'default',
                  items: [
                    {
                      type: 'ActionSet',
                      spacing: 'none',
                      actions: [
                        {
                          type: 'Action.ToggleVisibility',
                          title: '🔼 收起',
                          tooltip: '收起思考过程',
                          targetElements: [
                            'thinkingContent',
                            'collapseButtonContainer',
                            'expandButtonContainer'
                          ]
                        }
                      ]
                    }
                  ]
                },
                {
                  type: 'Container',
                  id: 'expandButtonContainer',
                  isVisible: true,
                  style: 'default',
                  items: [
                    {
                      type: 'ActionSet',
                      spacing: 'none',
                      actions: [
                        {
                          type: 'Action.ToggleVisibility',
                          title: '🔽 展开',
                          tooltip: '展开思考过程',
                          targetElements: [
                            'thinkingContent',
                            'collapseButtonContainer',
                            'expandButtonContainer'
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            },
            {
              type: 'Column',
              width: 'stretch',
              items: []
            }
          ]
        },
        {
          type: 'TextBlock',
          id: 'thinkingContent',
          text: thinkingContent || '...',
          wrap: true,
          isVisible: false,
          spacing: 'small',
          color: 'default',
          fontType: 'monospace'
        }
      ]
    });
  }
}

export default handler;
