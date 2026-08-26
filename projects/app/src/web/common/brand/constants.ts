export const OMNICOCKPIT_NAME = 'OmniCockpit';

export const OMNICOCKPIT_ASSETS = {
  logo: '/omnicockpit/logo.svg?v=2',
  favicon: '/omnicockpit/favicon.svg?v=2',
  loginVisual: '/omnicockpit/login-visual.svg',
  chatBanner: '/omnicockpit/chat-banner.svg',
  chatBannerFold: '/omnicockpit/chat-banner-fold.svg',
  chatDiagram: {
    zhCN: '/imgs/chat/omnicockpit_chat_diagram.png',
    en: '/imgs/chat/omnicockpit_chat_diagram_en.png',
    zhHant: '/imgs/chat/omnicockpit_chat_diagram_zh-Hant.png'
  }
} as const;

export const FASTGPT_VISIBLE_DEFAULTS = {
  systemTitle: 'FastGPT',
  favicon: '/favicon.ico'
} as const;
