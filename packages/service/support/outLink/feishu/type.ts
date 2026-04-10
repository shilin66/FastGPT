export type FeishuEventHeader = {
  event_id?: string;
  tenant_key?: string;
  create_time?: string;
  event_type?: string;
  app_id?: string;
};

export type FeishuSenderId = {
  open_id?: string;
  union_id?: string;
  user_id?: string;
};

export type FeishuMention = {
  key?: string;
  name?: string;
  id?: FeishuSenderId;
  tenant_key?: string;
};

export type FeishuMessage = {
  message_id?: string;
  root_id?: string;
  parent_id?: string;
  create_time?: string;
  chat_id?: string;
  thread_id?: string;
  chat_type?: 'p2p' | 'group';
  message_type?: string;
  content?: string;
  mentions?: FeishuMention[];
};

export type FeishuReceiveEvent = {
  sender?: {
    sender_id?: FeishuSenderId;
    sender_type?: string;
    tenant_key?: string;
  };
  message?: FeishuMessage;
};

export type FeishuCallbackPayload = {
  type?: string;
  challenge?: string;
  encrypt?: string;
  header?: FeishuEventHeader;
  event?: FeishuReceiveEvent;
};

export type FeishuMessageTextContent = {
  text?: string;
};

export type FeishuChatContext = {
  outLinkUid: string;
  chatId: string;
};
