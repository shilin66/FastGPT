import React from 'react';
import { Box, Button, Flex, Input, ModalBody, ModalFooter, Textarea } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import MyModal from '@fastgpt/web/components/common/MyModal';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useUploadAvatar } from '@fastgpt/web/common/file/hooks/useUploadAvatar';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';
import { postCreateSkill } from '@/web/core/skill/api';
import { useRouter } from 'next/router';

const DEFAULT_SKILL_AVATAR = 'core/skill/default';

type FormType = {
  avatar: string;
  name: string;
  intro?: string;
};

type Props = {
  parentId?: string | null;
  onClose: () => void;
  onSuccess?: () => void;
};

const CreateSkillModal = ({ parentId, onClose, onSuccess }: Props) => {
  const { t } = useTranslation();
  const router = useRouter();

  const { register, setValue, watch, handleSubmit } = useForm<FormType>({
    defaultValues: {
      avatar: DEFAULT_SKILL_AVATAR,
      name: '',
      intro: ''
    }
  });

  const avatar = watch('avatar');

  const { Component: AvatarUploader, handleFileSelectorOpen: handleAvatarSelectorOpen } =
    useUploadAvatar(getUploadAvatarPresignedUrl, {
      onSuccess(newAvatar) {
        setValue('avatar', newAvatar);
      }
    });

  const { run: onCreate, loading: isCreating } = useRequest(
    async ({ avatar, name, intro }: FormType) => {
      return postCreateSkill({
        parentId: parentId ?? null,
        name: name.trim(),
        description: intro?.trim() || undefined,
        avatar: avatar || undefined
      });
    },
    {
      onSuccess(skillId) {
        onSuccess?.();
        onClose();
        router.push(`/skill/detail?skillId=${skillId}`);
      },
      successToast: t('common:create_success'),
      errorToast: t('common:create_failed')
    }
  );

  return (
    <>
      <MyModal
        isOpen
        onClose={onClose}
        title={t('skill:create_skill')}
        w={'600px'}
        closeOnOverlayClick={false}
      >
        <ModalBody>
          {/* 图标 & 名称 */}
          <Box mb={5}>
            <FormLabel required mb={2.5}>
              {t('common:app_icon_and_name')}
            </FormLabel>
            <Flex alignItems={'center'}>
              <MyTooltip label={t('common:set_avatar')}>
                <Flex
                  borderRadius={'6px'}
                  w={10}
                  h={10}
                  border={'1px solid'}
                  borderColor={'myGray.200'}
                  justifyContent={'center'}
                  alignItems={'center'}
                  mr={2.5}
                  cursor={'pointer'}
                  onClick={handleAvatarSelectorOpen}
                >
                  <Avatar src={avatar} borderRadius={'4.667px'} />
                </Flex>
              </MyTooltip>
              <Input
                flex={1}
                h={'34px'}
                placeholder={t('skill:skill_name_placeholder')}
                {...register('name', { required: true })}
              />
            </Flex>
          </Box>

          {/* 介绍 */}
          <Box>
            <FormLabel mb={2.5}>{t('skill:skill_intro_label')}</FormLabel>
            <Textarea
              {...register('intro')}
              rows={3}
              placeholder={t('skill:skill_intro_placeholder')}
              resize={'vertical'}
            />
          </Box>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button isLoading={isCreating} onClick={handleSubmit((data) => onCreate(data))}>
            {t('common:Confirm')}
          </Button>
        </ModalFooter>
      </MyModal>
      <AvatarUploader />
    </>
  );
};

export default CreateSkillModal;
