import { OAuth2Client } from 'google-auth-library';

type BloggerOAuthEnvironment = Pick<
  NodeJS.ProcessEnv,
  'BLOGGER_OAUTH_CLIENT_ID' | 'BLOGGER_OAUTH_CLIENT_SECRET' | 'BLOGGER_REFRESH_TOKEN'
>;

export function createBloggerOAuthClient(
  env: BloggerOAuthEnvironment = process.env,
): OAuth2Client {
  const clientId = env.BLOGGER_OAUTH_CLIENT_ID;
  const clientSecret = env.BLOGGER_OAUTH_CLIENT_SECRET;
  const refreshToken = env.BLOGGER_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('BLOGGER_OAUTH_CONFIG_INVALID');
  }

  const client = new OAuth2Client(clientId, clientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}
