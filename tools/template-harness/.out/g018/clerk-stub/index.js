'use strict';
// Scratch Clerk stand-in for local browser acceptance only (never shipped): who is signed in comes from the
// `stub_user` cookie. Real Clerk stays DA-01 item 16.
const React = require('react');

function ClerkProvider({ children }) {
  return React.createElement(React.Fragment, null, children);
}

function placeholder(name) {
  return function ClerkStubPlaceholder() {
    return React.createElement('div', { 'data-clerk-stub': name }, `Clerk stub: ${name}`);
  };
}

function useClerk() {
  return {
    signOut: async (options) => {
      document.cookie = 'stub_user=; Max-Age=0; path=/';
      window.location.href = (options && options.redirectUrl) || '/';
    },
  };
}

module.exports = { ClerkProvider, SignIn: placeholder('SignIn'), SignUp: placeholder('SignUp'), UserProfile: placeholder('UserProfile'), useClerk };
