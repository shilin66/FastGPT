import React from 'react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { Box, Button, Flex, Image, Text } from '@chakra-ui/react';
import Markdown from '@/components/Markdown';

const ChromeExtension = () => {
  const description = `
# 安装
- 解压fastgpt-agent.zip
- chrome浏览器地址栏输入\`chrome://extensions/\`, 打开开发者模式(点击右上角开关，chrome版本不同可能位置差异)，点击加载已解压的扩展程序，选择fastgpt-agent文件夹
- 固定插件到浏览器顶部： <Image src='/imgs/outlink/desc/img.png' width="50%" ml="0"/>
- 更新插件的时候，保持安装目录不变，无需卸载(会清空配置)插件，只需要更新里面的文件即可，然后刷新插件，这样可保证配置不丢失。
<Image src='/imgs/outlink/desc/img_8.png' width="30%" ml="0"/>
刷新一下插件
<Image src='/imgs/outlink/desc/img_9.png' width="20%" ml="0"/>
# 配置
- 需要创建一个免登录窗口的链接,复制链接地址<Image src='/imgs/outlink/desc/img_1.png' width="50%" ml="0"/><br>
- 点击插件图标，打开设置<Image src='/imgs/outlink/desc/img_2.png' width="30%" ml="0"/><br>
- 在设置页面配置机器人地址，点击✅保存，可添加多个地址 <Image src='/imgs/outlink/desc/img_3.png' width="30%" ml="0"/><br>
- 添加完成在\`选择BOT\` 列，选中想要使用的机器人即可<Image src='/imgs/outlink/desc/img_7.png' width="30%" ml="0"/>
- 页面机器人默认显示在所有网页，详情见[使用方式2]。可以在配置页面调整机器人聊天框大小，也支持使用鼠标拖拽边框调整
# 使用
有两种使用方式：
### 方式1
- 1.在插件的弹出页面，点击插件图标，弹出插件页面，输入问题，点击发送按钮，即可获取回答<Image src='/imgs/outlink/desc/img_4.png' width="30%" ml="0"/><br>
### 方式2
- 2.在任意网站页面，点击ChatBot图标，在弹出的聊天窗口，输入问题，点击发送按钮，即可获取回答。如果插件发生过更新或者重装，需要刷新页面后才可使用<Image src='/imgs/outlink/desc/img_5.png' width="30%" ml="0"/><br><Image src='/imgs/outlink/desc/img_6.png' width="30%" ml="0"/>
`;
  const handleDownloadClick = () => {
    // 创建一个隐藏的可下载链接
    const link = document.createElement('a');
    // 设置链接的href属性为你的ZIP文件的URL
    link.href = '/chrome_extension/fastgpt_agent.zip';
    // 设置下载属性
    link.download = 'fastgpt_agent.zip';
    // 触发点击事件
    document.body.appendChild(link);
    link.click();
    // 清理
    document.body.removeChild(link);
  };
  return (
    <MyBox h={'100%'} position={'relative'}>
      <Flex alignItems={'center'} pt={1}>
        <Image
          src={'/imgs/outlink/chromeExtension.svg'}
          alt={'Download FastGPT Agent'}
          onClick={handleDownloadClick}
          onMouseEnter={(e) => (e.currentTarget.style.cursor = 'pointer')}
          onMouseLeave={(e) => (e.currentTarget.style.cursor = 'auto')}
        />
        <Button ml={[1, 2]} size={'sm'} onClick={handleDownloadClick}>
          {'点击下载插件'}
        </Button>
      </Flex>
      <Flex
        w="100%"
        h="1px"
        bg="gray.300"
        alignItems="center"
        justifyContent="center"
        position="relative"
        top="1rem"
      >
        <Text fontSize="sm" color="gray.500" bg="white" px="2" zIndex="1">
          使用说明
        </Text>
      </Flex>
      <Box pt={4}>
        <Markdown source={description}></Markdown>
      </Box>
    </MyBox>
  );
};
export default ChromeExtension;
