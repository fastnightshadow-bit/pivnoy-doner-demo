import webPush from 'web-push';

export const createWebPushSender = ({
  publicKey,
  privateKey,
  subject,
  client = webPush,
}) => {
  client.setVapidDetails(subject, publicKey, privateKey);
  return {
    send: (subscription, payload) =>
      client.sendNotification(subscription, JSON.stringify(payload), {
        TTL: 120,
        urgency: 'high',
      }),
  };
};
