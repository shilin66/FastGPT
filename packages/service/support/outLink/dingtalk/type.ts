export type DingtalkTextContent = {
  content?: string;
};

export type DingtalkAudioContent = {
  recognition?: string;
};

export type DingtalkFileContent = {
  fileName?: string;
};

export type DingtalkRichTextItem = {
  text?: string;
  type?: string;
};

export type DingtalkRichTextContent = {
  richText?: DingtalkRichTextItem[];
};

export type DingtalkMessage = {
  conversationId?: string;
  msgId?: string;
  senderId?: string;
  senderNick?: string;
  senderStaffId?: string;
  sessionWebhook?: string;
  sessionWebhookExpiredTime?: number;
  conversationType?: string;
  robotCode?: string;
  msgtype?: string;
  text?: DingtalkTextContent;
  content?: DingtalkAudioContent &
    DingtalkFileContent &
    DingtalkRichTextContent & {
      unknownMsgType?: string;
    };
};

export type DingtalkChatContext = {
  outLinkUid: string;
  chatId: string;
};
