import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Flex,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Input,
  ModalBody,
  Text,
  Textarea
} from '@chakra-ui/react';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useForm } from 'react-hook-form';
import MyModal from '@fastgpt/web/components/common/MyModal';
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

export const CreateSkillForm = ({
  parentId,
  onCancel,
  onSuccess,
  onBusyChange
}: {
  parentId?: string | null;
  onCancel: () => void;
  onSuccess: (skillId: string) => void;
  onBusyChange?: (busy: boolean) => void;
}) => {
  const { t } = useTranslation();
  const requestId = useRef<string>();
  const [creationError, setCreationError] = useState('');

  const {
    register,
    setValue,
    watch,
    handleSubmit,
    formState: { errors }
  } = useForm<FormType>({
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
      if (!requestId.current) {
        // getRandomValues supports plain HTTP; keep the API's UUID v4 idempotency key format.
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
        requestId.current = [
          hex.slice(0, 8),
          hex.slice(8, 12),
          hex.slice(12, 16),
          hex.slice(16, 20),
          hex.slice(20)
        ].join('-');
      }
      return postCreateSkill({
        requestId: requestId.current,
        parentId: parentId ?? null,
        name: name.trim(),
        description: intro?.trim() || undefined,
        avatar: avatar || undefined
      });
    },
    {
      onError(error) {
        setCreationError(getErrText(error));
      },
      onSuccess(skillId) {
        onSuccess(skillId);
      },
      successToast: t('common:create_success'),
      errorToast: t('common:create_failed')
    }
  );

  useEffect(() => onBusyChange?.(isCreating), [isCreating, onBusyChange]);

  return (
    <>
      <Box as="form" onSubmit={handleSubmit((data) => onCreate(data))}>
        <Box as="fieldset" disabled={isCreating} minW={0}>
          {creationError && (
            <Alert status="error" mb={4}>
              {creationError}
            </Alert>
          )}
          {/* 图标 & 名称 */}
          <FormControl isRequired isInvalid={!!errors.name} mb={5}>
            <FormLabel htmlFor="skill-create-name" mb={2.5} fontSize="sm">
              {t('common:app_icon_and_name')}
            </FormLabel>
            <Flex alignItems={'center'}>
              <MyTooltip label={t('common:set_avatar')}>
                <Button
                  type="button"
                  variant="whiteBase"
                  aria-label={t('common:set_avatar')}
                  p={0}
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
                </Button>
              </MyTooltip>
              <Input
                id="skill-create-name"
                flex={1}
                minW={0}
                h={10}
                placeholder={t('skill:skill_name_placeholder')}
                {...register('name', {
                  required: t('skill:skill_name_required'),
                  validate: (value) => !!value.trim() || t('skill:skill_name_required')
                })}
              />
            </Flex>
            <FormErrorMessage>{errors.name?.message}</FormErrorMessage>
          </FormControl>

          {/* 介绍 */}
          <Box>
            <FormLabel htmlFor="skill-create-intro" mb={2.5} fontSize="sm">
              {t('skill:skill_intro_label')}
              <Box as="span" ml={2} color="myGray.500" fontWeight="normal" fontSize="xs">
                {t('skill:create_optional')}
              </Box>
            </FormLabel>
            <Textarea
              id="skill-create-intro"
              {...register('intro')}
              rows={4}
              placeholder={t('skill:skill_intro_placeholder')}
              resize={'vertical'}
            />
          </Box>
          <Text mt={3} fontSize="sm" color="myGray.500" lineHeight="tall">
            {t('skill:create_blank_form_hint')}
          </Text>
        </Box>
        <Flex gap={3} mt={6} justify="flex-end" flexWrap="wrap">
          <Button type="button" variant={'whiteBase'} onClick={onCancel} isDisabled={isCreating}>
            {t('common:Cancel')}
          </Button>
          <Button type="submit" isLoading={isCreating}>
            {t('skill:create_and_open_workspace')}
          </Button>
        </Flex>
      </Box>
      <AvatarUploader />
    </>
  );
};

const CreateSkillModal = ({ parentId, onClose, onSuccess }: Props) => {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={t('skill:create_skill')}
      w="600px"
      closeOnOverlayClick={false}
    >
      <ModalBody>
        <CreateSkillForm
          parentId={parentId}
          onCancel={onClose}
          onSuccess={(skillId) => {
            onSuccess?.();
            onClose();
            router.push(`/skill/detail?skillId=${skillId}`);
          }}
        />
      </ModalBody>
    </MyModal>
  );
};

export default CreateSkillModal;
