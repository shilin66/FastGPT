export type WecomRobotEnvelope = {
  encrypt?: string;
};

export type WecomRobotText = {
  content?: string;
};

export type WecomRobotImage = {
  url?: string;
};

export type WecomRobotMessage = {
  msgtype?: 'text' | 'stream' | 'image' | 'mixed' | 'event' | string;
  msgid?: string;
  aibotid?: string;
  chatid?: string;
  chattype?: 'single' | 'group' | string;
  response_url?: string;
  from?: {
    userid?: string;
  };
  text?: WecomRobotText;
  image?: WecomRobotImage;
  event?: Record<string, any>;
};

export type WecomChatContext = {
  outLinkUid: string;
  chatId: string;
};
