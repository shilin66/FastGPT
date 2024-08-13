import { serviceSideProps } from '@/web/common/utils/i18n';
import PageContainer from '@/components/PageContainer';
import { useSystemStore } from '@/web/common/system/useSystemStore';

const Search = () => {
  const { feConfigs } = useSystemStore();
  return (
    <PageContainer>
      <iframe src={feConfigs.perplexica_url} width={'100%'} height={'100%'}></iframe>
    </PageContainer>
  );
};

export default Search;

export async function getServerSideProps(context: any) {
  return {
    props: { ...(await serviceSideProps(context)) }
  };
}
