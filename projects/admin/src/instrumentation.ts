export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const [{ connectMongo }, { connectionMongo, connectionLogMongo, MONGO_URL, MONGO_LOG_URL }] =
    await Promise.all([
      import('@fastgpt/service/common/mongo/init'),
      import('@fastgpt/service/common/mongo')
    ]);

  await Promise.all([
    connectMongo({ db: connectionMongo, url: MONGO_URL }),
    connectMongo({ db: connectionLogMongo, url: MONGO_LOG_URL })
  ]);
}
