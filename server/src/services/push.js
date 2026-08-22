export const createPushService = ({ repository, publicKey }) => ({
  getPublicKey: () => publicKey,

  subscribe: (account, subscription, userAgent = '') =>
    repository.upsertSubscription({
      accountId: account.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent: String(userAgent).slice(0, 512),
    }),

  unsubscribe: (account, endpoint) =>
    repository.deleteSubscription(account.id, endpoint),
});
