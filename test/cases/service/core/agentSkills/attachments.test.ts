import { describe, expect, it, vi } from 'vitest';
import {
  assertSkillAttachmentKey,
  refreshSkillAttachments
} from '@fastgpt/service/core/agentSkills/attachments';
import { ChatRoleEnum, ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';

const { sign } = vi.hoisted(() => ({
  sign: vi.fn(async ({ key }: { key: string }) => ({ url: `https://files.example.test/${key}` }))
}));
vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  getS3ChatSource: () => ({ createGetChatFileURL: sign })
}));

describe('Skill attachments', () => {
  const scope = { skillId: 'skill', chatId: 'chat', tmbId: 'member' };
  it.each([
    'chat/other/member/chat/file.txt',
    'chat/skill/member/other/file.txt',
    'chat/skill/other/chat/file.txt',
    'chat/skill/member/chat/../file.txt',
    'chat/skill/member/chat/..',
    'chat/skill/member/chat/a\\b.txt',
    'https://evil.test/file.txt'
  ])('rejects untrusted or mismatched key %s', (key) => {
    expect(() => assertSkillAttachmentKey({ ...scope, key })).toThrow('scope');
  });
  it('replaces the supplied URL only after validating its object scope', async () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.Human,
        value: [
          {
            file: {
              type: ChatFileTypeEnum.file,
              key: 'chat/skill/member/chat/file.txt',
              url: 'http://untrusted.test/secret'
            }
          }
        ]
      }
    ];
    await refreshSkillAttachments({ ...scope, messages });
    expect(messages[0].value[0].file?.url).toBe(
      'https://files.example.test/chat/skill/member/chat/file.txt'
    );
    expect(sign).toHaveBeenCalledWith({ key: 'chat/skill/member/chat/file.txt', external: false });
  });
});
