import { StandSubPlanLevelMapType, SubPlanType } from '../../../support/wallet/sub/type';
import type {
  ChatModelItemType,
  FunctionModelItemType,
  LLMModelItemType,
  VectorModelItemType,
  AudioSpeechModels,
  STTModelType,
  ReRankModelItemType
} from '../../../core/ai/model.d';
import { SubTypeEnum } from '../../../support/wallet/sub/constants';

export type NavbarItemType = {
  id: string;
  name: string;
  avatar: string;
  url: string;
  isActive: boolean;
};

export type ExternalProviderWorkflowVarType = {
  name: string;
  key: string;
  intro: string;
  isOpen: boolean;
  url?: string;
};

/* fastgpt main */
export type FastGPTConfigFileType = {
  feConfigs: FastGPTFeConfigsType;
  systemEnv: SystemEnvType;
  subPlans?: SubPlanType;
  llmModels: ChatModelItemType[];
  vectorModels: VectorModelItemType[];
  reRankModels: ReRankModelItemType[];
  audioSpeechModels: AudioSpeechModelType[];
  whisperModel: STTModelType;
};

export type FastGPTFeConfigsType = {
  show_emptyChat?: boolean;
  register_method?: ['email' | 'phone' | 'sync'];
  login_method?: ['email' | 'phone']; // Attention: login method is diffrent with oauth
  find_password_method?: ['email' | 'phone'];
  bind_notification_method?: ['email' | 'phone'];
  show_appStore?: boolean;
  show_git?: boolean;
  show_pay?: boolean;
  show_openai_account?: boolean;
  show_promotion?: boolean;
  show_team_chat?: boolean;
  show_compliance_copywriting?: boolean;
  concatMd?: string;

  confluenceUrl?: string;
  docUrl?: string;
  openAPIDocUrl?: string;
  systemPluginCourseUrl?: string;
  appTemplateCourse?: string;

  systemTitle?: string;
  systemDescription?: string;
  googleClientVerKey?: string;
  isPlus?: boolean;
  userDefaultTeam?: string;
  sso?: {
    icon?: string;
    title?: string;
    url?: string;
    autoLogin?: boolean;
  };
  oauth?: {
    github?: GithubType;
    google?: string;
    wechat?: string;
    microsoft?: MicrosoftType;
    dingtalk?: string;
    wecom?: {
      corpid?: string;
      agentid?: string;
    };
  };
  limit?: {
    exportDatasetLimitMinutes?: number;
    websiteSyncLimitMinuted?: number;
  };
  scripts?: { [key: string]: string }[];
  favicon?: string;
  customApiDomain?: string;
  customSharePageDomain?: string;
  perplexica_url?: string;
  uploadFileMaxAmount?: number;
  uploadFileMaxSize?: number;
  lafEnv?: string;
  navbarItems?: NavbarItemType[];
  externalProviderWorkflowVariables?: ExternalProviderWorkflowVarType[];
};

export type GithubType = {
  clientId: string;
  clientSecret: string;
};

export type MicrosoftType = {
  clientId: string;
  tenantId: string;
  clientSecret?: string;
};

export type SystemEnvType = {
  openapiPrefix?: string;
  vectorMaxProcess: number;
  qaMaxProcess: number;
  pgHNSWEfSearch: number;
  tokenWorkers: number; // token count max worker

  oneapiUrl?: string;
  chatApiKey?: string;
};
