import { Box, Button, Flex } from '@chakra-ui/react';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import { useTranslation } from 'next-i18next';
import { AppLogKeysEnumMap } from '@fastgpt/global/core/app/logs/constants';
import type {
  DraggableProvided,
  DraggableStateSnapshot
} from '@fastgpt/web/components/common/DndDrag';
import DndDrag, { Draggable } from '@fastgpt/web/components/common/DndDrag';
import MyIcon from '@fastgpt/web/components/common/Icon';
import React from 'react';
import type { AppLogKeysType } from '@fastgpt/global/core/app/logs/type';
import type { SetState } from 'ahooks/lib/createUseStorageState';

const LogKeysConfigPopover = ({
  logKeysList,
  setLogKeysList
}: {
  logKeysList: AppLogKeysType[];
  setLogKeysList: (value: SetState<AppLogKeysType[]>) => void;
}) => {
  const { t } = useTranslation();
  return (
    <MyPopover
      placement="bottom-end"
      w={'360px'}
      closeOnBlur={true}
      trigger="click"
      Trigger={
        <Button
          size={'md'}
          variant={'whiteBase'}
          leftIcon={<MyIcon name={'common/setting'} w={'18px'} />}
        >
          {t('app:logs_key_config')}
        </Button>
      }
    >
      {() => {
        return (
          <Box p={0} overflow={'hidden'}>
            <Flex
              alignItems={'flex-start'}
              gap={3}
              px={4}
              py={3.5}
              bg={'linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%)'}
              borderBottom={'1px solid rgba(148, 163, 184, 0.18)'}
            >
              <Flex
                alignItems={'center'}
                justifyContent={'center'}
                w={'34px'}
                h={'34px'}
                flexShrink={0}
                borderRadius={'10px'}
                bg={'#2563EB'}
                color={'white'}
              >
                <MyIcon name={'common/setting'} w={'17px'} />
              </Flex>
              <Box minW={0}>
                <Box color={'#1E293B'} fontSize={'14px'} fontWeight={800}>
                  {t('app:logs_key_config')}
                </Box>
                <Box mt={1} color={'#64748B'} fontSize={'12px'} lineHeight={1.45}>
                  拖动调整列顺序，点击可见状态控制日志列表字段。
                </Box>
              </Box>
            </Flex>
            <Box p={3} overflowY={'auto'} maxH={['320px', '520px']} bg={'#F8FAFC'}>
              <DndDrag<AppLogKeysType>
                onDragEndCb={setLogKeysList}
                dataList={logKeysList}
                renderClone={(provided, snapshot, rubric) => (
                  <DragItem
                    item={logKeysList[rubric.source.index]}
                    provided={provided}
                    snapshot={snapshot}
                    logKeys={logKeysList}
                    setLogKeys={setLogKeysList}
                  />
                )}
              >
                {({ provided }) => (
                  <Box {...provided.droppableProps} ref={provided.innerRef}>
                    {logKeysList.map((item, index) => (
                      <Draggable key={item.key} draggableId={item.key} index={index}>
                        {(provided, snapshot) => (
                          <Box mb={index === logKeysList.length - 1 ? 0 : 2}>
                            <DragItem
                              item={item}
                              provided={provided}
                              snapshot={snapshot}
                              logKeys={logKeysList}
                              setLogKeys={setLogKeysList}
                            />
                          </Box>
                        )}
                      </Draggable>
                    ))}
                  </Box>
                )}
              </DndDrag>
            </Box>
          </Box>
        );
      }}
    </MyPopover>
  );
};

export default LogKeysConfigPopover;

const DragItem = ({
  item,
  provided,
  snapshot,
  logKeys,
  setLogKeys
}: {
  item: AppLogKeysType;
  provided: DraggableProvided;
  snapshot: DraggableStateSnapshot;
  logKeys: AppLogKeysType[];
  setLogKeys: (logKeys: AppLogKeysType[]) => void;
}) => {
  const { t } = useTranslation();

  return (
    <Flex
      ref={provided.innerRef}
      {...provided.draggableProps}
      style={{
        ...provided.draggableProps.style,
        opacity: snapshot.isDragging ? 0.8 : 1
      }}
      alignItems={'center'}
      gap={2.5}
      px={3}
      py={2.5}
      border={'1px solid'}
      borderColor={snapshot.isDragging ? 'rgba(37, 99, 235, 0.42)' : 'rgba(148, 163, 184, 0.18)'}
      borderRadius={'12px'}
      bg={snapshot.isDragging ? '#EFF6FF' : 'white'}
      boxShadow={snapshot.isDragging ? '0 16px 34px rgba(37, 99, 235, 0.16)' : 'none'}
    >
      <Flex
        {...provided.dragHandleProps}
        alignItems={'center'}
        justifyContent={'center'}
        w={'28px'}
        h={'28px'}
        flexShrink={0}
        borderRadius={'9px'}
        bg={'#F1F5F9'}
      >
        <MyIcon name={'drag'} w={'12px'} color={'#64748B'} _hover={{ color: '#2563EB' }} />
      </Flex>
      <Box fontSize={'14px'} color={'#1E293B'} fontWeight={700}>
        {t(AppLogKeysEnumMap[item.key])}
      </Box>
      <Box flex={1} />
      {item.enable ? (
        <MyIcon
          name={'visible'}
          borderRadius={'9px'}
          w={'28px'}
          h={'28px'}
          p={1.5}
          cursor={'pointer'}
          color={'#2563EB'}
          bg={'rgba(37, 99, 235, 0.08)'}
          _hover={{ bg: 'rgba(37, 99, 235, 0.14)' }}
          onClick={() => {
            setLogKeys(
              logKeys.map((key) => (key.key === item.key ? { ...key, enable: false } : key))
            );
          }}
        />
      ) : (
        <MyIcon
          name={'invisible'}
          borderRadius={'9px'}
          w={'28px'}
          h={'28px'}
          p={1.5}
          cursor={'pointer'}
          color={'#94A3B8'}
          bg={'#F1F5F9'}
          _hover={{ bg: '#E2E8F0' }}
          onClick={() => {
            setLogKeys(
              logKeys.map((key) => (key.key === item.key ? { ...key, enable: true } : key))
            );
          }}
        />
      )}
    </Flex>
  );
};
