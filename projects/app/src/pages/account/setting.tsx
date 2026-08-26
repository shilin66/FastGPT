export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/account/info#preferences',
      permanent: false
    }
  };
}

export default function AccountSettingRedirect() {
  return null;
}
