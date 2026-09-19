import type { GetServerSidePropsContext } from 'next';
import { serviceSideProps } from '@/web/common/i18n/utils';
import CreateSkillPage from '@/pageComponents/dashboard/skill/CreateSkillPage';

export default CreateSkillPage;

export async function getServerSideProps(context: GetServerSidePropsContext) {
  return { props: await serviceSideProps(context, ['app', 'common', 'file', 'skill']) };
}
