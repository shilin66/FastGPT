import React, { useEffect, useState } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useUserStore } from '@/web/support/user/useUserStore';
import { Button, ModalBody, ModalFooter } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';
import { getSystemMsgModalData } from '@/web/support/user/inform/api';
import dynamic from 'next/dynamic';
import { getLicenseExpiryNotice } from '@/web/support/license/api';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/router';
import {
  formatLicenseExpiryTime,
  licenseExpiryDayMs,
  renderLicenseExpiryTemplate
} from '@fastgpt/global/common/system/licenseExpiry';
import { webPushTrack } from '@/web/common/middle/tracks/utils';
const Markdown = dynamic(() => import('@/components/Markdown'), { ssr: false });

const SystemMsgModal = () => {
  const { t, i18n } = useTranslation();
  const { pathname } = useRouter();
  const { feConfigs } = useSystemStore();
  const {
    userInfo,
    systemMsgReadId,
    setSysMsgReadId,
    licenseNoticeReadIds,
    setLicenseNoticeReadId
  } = useUserStore();
  const [hydrated, setHydrated] = useState(useUserStore.persist.hasHydrated());
  const [otherModalOpen, setOtherModalOpen] = useState(false);
  const userId = userInfo?._id;
  const enabled =
    !!userId && hydrated && !pathname.startsWith('/login') && pathname !== '/chat/share';

  useEffect(() => {
    const unsubscribe = useUserStore.persist.onFinishHydration(() => setHydrated(true));
    setHydrated(useUserStore.persist.hasHydrated());
    const syncRead = (event: StorageEvent) => {
      if (event.key === 'userStore') void useUserStore.persist.rehydrate();
    };
    window.addEventListener('storage', syncRead);
    return () => {
      unsubscribe();
      window.removeEventListener('storage', syncRead);
    };
  }, []);

  useEffect(() => {
    const check = () =>
      setOtherModalOpen(
        !!document.querySelector(
          '[role="dialog"]:not([data-system-message]), [role="alertdialog"]:not([data-system-message])'
        )
      );
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const expiry = useQuery(['licenseExpiryNotice', userId], getLicenseExpiryNotice, {
    enabled,
    staleTime: 60000,
    refetchInterval: 15 * 60 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false
  });
  // Fetch after expiry detection so a renewal's restored welcome message is current.
  const announcement = useQuery(
    ['systemMsgModal', userId, expiry.dataUpdatedAt],
    getSystemMsgModalData,
    {
      enabled: enabled && !!feConfigs?.isPlus && expiry.isFetched,
      retry: false
    }
  );

  const notice = expiry.data;
  const unreadNotice =
    notice && userId && !licenseNoticeReadIds[userId]?.includes(notice.id) ? notice : null;
  const unreadAnnouncement =
    feConfigs?.isPlus && announcement.data?.content && announcement.data.id !== systemMsgReadId
      ? announcement.data
      : null;
  if (!enabled || otherModalOpen || (!unreadNotice && !unreadAnnouncement)) return null;

  const content = unreadNotice
    ? renderLicenseExpiryTemplate(
        unreadNotice.content ||
          t(`common:license_expiry_template_${unreadNotice.stage}`, {
            expiresAt: '{{expiresAt}}',
            remainingDays: '{{remainingDays}}'
          }),
        {
          expiresAt: formatLicenseExpiryTime(unreadNotice.expiresAt, i18n.language),
          remainingDays:
            Date.parse(unreadNotice.expiresAt) - Date.parse(unreadNotice.serverNow) <
            licenseExpiryDayMs
              ? t('common:license_expiry_less_than_day')
              : t('common:license_expiry_days', { days: unreadNotice.remainingDays })
        }
      )
    : unreadAnnouncement?.content;
  const onRead = () => {
    if (unreadNotice && userId) {
      setLicenseNoticeReadId(userId, unreadNotice.id);
    } else if (unreadAnnouncement) {
      setSysMsgReadId(unreadAnnouncement.id || '');
      webPushTrack.readSystemAnnouncement({ announcementId: unreadAnnouncement.id || '' });
    }
  };

  return (
    <MyModal
      isOpen
      iconSrc={LOGO_ICON}
      data-system-message="true"
      onClose={unreadNotice ? onRead : undefined}
      title={
        unreadNotice
          ? t('common:license_expiry_notice_title')
          : t('common:support.user.inform.System message')
      }
    >
      <ModalBody overflow={'auto'}>
        <Markdown source={content} />
      </ModalBody>
      <ModalFooter>
        <Button onClick={onRead}>
          {unreadNotice ? t('common:license_expiry_acknowledge') : t('common:support.inform.Read')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(SystemMsgModal);
