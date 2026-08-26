import { type BoxProps } from '@chakra-ui/react';

export const textareaMinH = '22px';

export const MessageCardStyle: BoxProps = {
  px: [3, 4],
  py: 3,
  borderRadius: '8px',
  boxShadow: 'none',
  display: 'inline-block',
  maxW: '100%',
  color: 'myGray.900'
};

export enum FeedbackTypeEnum {
  user = 'user',
  admin = 'admin',
  hidden = 'hidden'
}

export enum ChatTypeEnum {
  test = 'test',
  chat = 'chat',
  log = 'log',
  share = 'share',
  team = 'team',
  home = 'home'
}
