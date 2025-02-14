import React, { useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import 'katex/dist/katex.min.css';
import RemarkMath from 'remark-math'; // Math syntax
import RemarkBreaks from 'remark-breaks'; // Line break
import RehypeKatex from 'rehype-katex'; // Math render
import RemarkGfm from 'remark-gfm'; // Special markdown syntax
import RehypeExternalLinks from 'rehype-external-links';
import RehypeRaw from 'rehype-raw';

import styles from './index.module.scss';
import dynamic from 'next/dynamic';

import { Box } from '@chakra-ui/react';
import { CodeClassNameEnum } from './utils';
import { useTranslation } from 'next-i18next';

const CodeLight = dynamic(() => import('./codeBlock/CodeLight'), { ssr: false });
const MermaidCodeBlock = dynamic(() => import('./img/MermaidCodeBlock'), { ssr: false });
const MdImage = dynamic(() => import('./img/Image'), { ssr: false });
const EChartsCodeBlock = dynamic(() => import('./img/EChartsCodeBlock'), { ssr: false });
const IframeCodeBlock = dynamic(() => import('./codeBlock/Iframe'), { ssr: false });
const IframeHtmlCodeBlock = dynamic(() => import('./codeBlock/iframe-html'), { ssr: false });
const VideoBlock = dynamic(() => import('./codeBlock/Video'), { ssr: false });
const AudioBlock = dynamic(() => import('./codeBlock/Audio'), { ssr: false });

const ChatGuide = dynamic(() => import('./chat/Guide'), { ssr: false });
const QuestionGuide = dynamic(() => import('./chat/QuestionGuide'), { ssr: false });
const A = dynamic(() => import('./A'), { ssr: false });

type Props = {
  source?: string;
  showAnimation?: boolean;
  isDisabled?: boolean;
  forbidZhFormat?: boolean;
};
const Markdown = (props: Props) => {
  const source = props.source || '';

  if (source.length < 200000) {
    return <MarkdownRender {...props} />;
  }

  return <Box whiteSpace={'pre-wrap'}>{source}</Box>;
};
const MarkdownRender = ({ source = '', showAnimation, isDisabled, forbidZhFormat }: Props) => {
  const components = useMemo<any>(
    () => ({
      img: Image,
      pre: RewritePre,
      code: Code,
      a: A
    }),
    []
  );

  const { t } = useTranslation();
  const converterThinkTags = (input: string): string => {
    const thinkTagReg = /<think>([\s\S]*?)<\/think>/g;
    if (input.startsWith('<think>')) {
      if (!thinkTagReg.test(input)) {
        const quotedContent = input
          .trim()
          .split('\n')
          .map((line: string) => `> ${line.trim()}`)
          .join('\n');
        return `
<details open>
<summary style="
  padding: 6px;
  color: #595959;
  font-size: 15px;
  border-radius: 4px;
  width: 150px;
  background: white;
">
  🤔️ ${t('core.chat.response.thinking')}
</summary>

${quotedContent}

</details>
`;
      } else {
        return input.replace(/<think>([\s\S]*?)<\/think>/g, (_, content) => {
          const quotedContent = content
            .trim()
            .split('\n')
            .map((line: string) => `> ${line}`)
            .join('\n');

          return `
<details>
<summary style="
  padding: 6px;
  color: #595959;
  font-size: 15px;
  border-radius: 6px;
  width: 150px;
  background: white;
">
   🤔️ ${t('core.chat.response.think process')}
</summary>

${quotedContent}

</details>
`;
        });
      }
    } else {
      return input;
    }
  };

  const formatSource = useMemo(() => {
    const latex = source
      .replace(/\\\(.*?\\\)/g, (match) => `$${match.slice(2, -2)}$`)
      .replace(/\\\[.*?\\\]/gs, (match) => `$$${match.slice(2, -2)}$$`);
    const think = converterThinkTags(latex);
    if (showAnimation || forbidZhFormat) return think;

    // 保护 URL 格式：https://, http://, /api/xxx
    const urlPlaceholders: string[] = [];
    const textWithProtectedUrls = think.replace(
      /https?:\/\/(?:(?:[\w-]+\.)+[a-zA-Z]{2,6}|localhost)(?::\d{2,5})?(?:\/[\w\-./?%&=@]*)?/g,
      (match) => {
        urlPlaceholders.push(match);
        return `__URL_${urlPlaceholders.length - 1}__ `;
      }
    );

    // 处理中文与英文数字之间的分词
    const textWithSpaces = textWithProtectedUrls
      .replace(
        /([\u4e00-\u9fa5\u3000-\u303f])([a-zA-Z0-9])|([a-zA-Z0-9])([\u4e00-\u9fa5\u3000-\u303f])/g,
        '$1$3 $2$4'
      )
      // 处理引用标记
      .replace(/\n*(\[QUOTE SIGN\]\(.*\))/g, '$1')
      // 处理 [quote:id] 格式引用，将 [quote:675934a198f46329dfc6d05a] 转换为 [675934a198f46329dfc6d05a](QUOTE)
      .replace(/\[quote:?\s*([a-f0-9]{24})\](?!\()/gi, '[$1](QUOTE)')
      .replace(/\[([a-f0-9]{24})\](?!\()/g, '[$1](QUOTE)');

    // 还原 URL
    const finalText = textWithSpaces.replace(
      /__URL_(\d+)__/g,
      (_, index) => `${urlPlaceholders[parseInt(index)]}`
    );

    return finalText;
  }, [forbidZhFormat, showAnimation, source]);

  const urlTransform = useCallback((val: string) => {
    return val;
  }, []);

  return (
    <Box position={'relative'}>
      <ReactMarkdown
        className={`markdown ${styles.markdown}
      ${showAnimation ? `${formatSource ? styles.waitingAnimation : styles.animation}` : ''}
    `}
        remarkPlugins={[RemarkMath, [RemarkGfm, { singleTilde: false }], RemarkBreaks]}
        rehypePlugins={[RehypeKatex, RehypeRaw, [RehypeExternalLinks, { target: '_blank' }]]}
        components={components}
        urlTransform={urlTransform}
      >
        {formatSource}
      </ReactMarkdown>
      {isDisabled && <Box position={'absolute'} top={0} right={0} left={0} bottom={0} />}
    </Box>
  );
};

export default React.memo(Markdown);

/* Custom dom */
function Code(e: any) {
  const { className, codeBlock, children } = e;
  const match = /language-(\w+)/.exec(className || '');
  const codeType = match?.[1];

  const strChildren = String(children);

  const Component = useMemo(() => {
    if (codeType === CodeClassNameEnum.mermaid) {
      return <MermaidCodeBlock code={strChildren} />;
    }
    if (codeType === CodeClassNameEnum.guide) {
      return <ChatGuide text={strChildren} />;
    }
    if (codeType === CodeClassNameEnum.questionGuide) {
      return <QuestionGuide text={strChildren} />;
    }
    if (codeType === CodeClassNameEnum.echarts) {
      return <EChartsCodeBlock code={strChildren} />;
    }
    if (codeType === CodeClassNameEnum.iframe) {
      return <IframeCodeBlock code={strChildren} />;
    }
    if (codeType && codeType.toLowerCase() === CodeClassNameEnum.html) {
      return (
        <IframeHtmlCodeBlock className={className} codeBlock={codeBlock} match={match}>
          {children}
        </IframeHtmlCodeBlock>
      );
    }
    if (codeType === CodeClassNameEnum.video) {
      return <VideoBlock code={strChildren} />;
    }
    if (codeType === CodeClassNameEnum.audio) {
      return <AudioBlock code={strChildren} />;
    }

    return (
      <CodeLight className={className} codeBlock={codeBlock} match={match}>
        {children}
      </CodeLight>
    );
  }, [codeType, className, codeBlock, match, children, strChildren]);

  return Component;
}

const Image = React.memo(function Image({ src, ...props }: { src?: string; [key: string]: any }) {
  return <MdImage src={src} {...props} />;
});

function RewritePre({ children }: any) {
  const modifiedChildren = React.Children.map(children, (child) => {
    if (React.isValidElement(child)) {
      // @ts-ignore
      return React.cloneElement(child, { codeBlock: true });
    }
    return child;
  });

  return <>{modifiedChildren}</>;
}
