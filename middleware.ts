const REALM = 'Mantafrog Tools';

const DEFAULT_USERNAME = 'mantafrog';
const DEFAULT_PASSWORD = 'admin001';

function unauthorizedResponse(): Response {
  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
    },
  });
}

function isAuthorized(request: Request): boolean {
  const header = request.headers.get('authorization');
  if (!header) return false;

  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) return false;

  try {
    const decoded = atob(encoded);
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) return false;

    const providedUsername = decoded.slice(0, separatorIndex);
    const providedPassword = decoded.slice(separatorIndex + 1);

    const expectedUsername = process.env.BASIC_AUTH_USERNAME || DEFAULT_USERNAME;
    const expectedPassword = process.env.BASIC_AUTH_PASSWORD || DEFAULT_PASSWORD;

    return providedUsername === expectedUsername && providedPassword === expectedPassword;
  } catch {
    return false;
  }
}

export default function middleware(request: Request): Promise<Response> | Response {
  if (isAuthorized(request)) {
    return fetch(request);
  }
  return unauthorizedResponse();
}

export const config = {
  matcher: '/:path*',
};

