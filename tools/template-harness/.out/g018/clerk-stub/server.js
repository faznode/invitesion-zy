'use strict';
// Scratch Clerk stand-in (server side): the `stub_user` cookie names the Clerk user id; no token is ever issued.
const { cookies } = require('next/headers');
const { NextResponse } = require('next/server');

const fromCookieHeader = (header) => {
  const match = /(?:^|;\s*)stub_user=([^;]+)/.exec(header || '');
  return match ? decodeURIComponent(match[1]) : null;
};

async function auth() {
  const store = await cookies();
  const userId = store.get('stub_user')?.value || null;
  return { userId, sessionId: userId ? 'sess_stub' : null, getToken: async () => null };
}

async function currentUser() {
  const { userId } = await auth();
  if (!userId) return null;
  return { id: userId, primaryEmailAddress: { emailAddress: `${userId}@example.test` }, firstName: 'Stub', lastName: userId, imageUrl: '' };
}

function clerkMiddleware(handler) {
  return async (request, event) => {
    const userId = fromCookieHeader(request.headers.get('cookie'));
    const result = await handler(async () => ({ userId }), request, event);
    return result ?? NextResponse.next();
  };
}

module.exports = { auth, currentUser, clerkMiddleware };
