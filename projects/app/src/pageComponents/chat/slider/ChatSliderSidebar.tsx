import React from 'react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import ChatSliderHeader from '@/pageComponents/chat/slider/ChatSliderHeader';
import ChatSliderMenu from '@/pageComponents/chat/slider/ChatSliderMenu';
import ChatSliderList from '@/pageComponents/chat/slider/ChatSliderList';

type Props = {
  title?: string;
  banner?: string;
  menuConfirmButtonText?: string;
};

const ChatHistorySidebar = ({ title, banner, menuConfirmButtonText }: Props) => {
  return (
    <MyBox
      display={'flex'}
      flexDirection={'column'}
      w={'100%'}
      h={'100%'}
      bg={'myGray.25'}
      borderRight={['', 'base']}
      whiteSpace={'nowrap'}
    >
      <ChatSliderHeader title={title} banner={banner} />
      <ChatSliderMenu menuConfirmButtonText={menuConfirmButtonText} />
      <ChatSliderList />
    </MyBox>
  );
};

export default ChatHistorySidebar;
