export const urlBase64ToUint8Array = (value) => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replaceAll('-', '+').replaceAll('_', '/');
  const binary = globalThis.atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const serializeSubscription = (subscription) => {
  const value = subscription?.toJSON?.() ?? subscription;
  return {
    endpoint: String(value?.endpoint ?? ''),
    keys: {
      p256dh: String(value?.keys?.p256dh ?? ''),
      auth: String(value?.keys?.auth ?? ''),
    },
  };
};

export const createCourierPushManager = ({
  api,
  notificationApi = globalThis.Notification,
  serviceWorker = globalThis.navigator?.serviceWorker,
} = {}) => {
  const getRegistration = async () => {
    if (!notificationApi || !serviceWorker?.ready) return null;
    const registration = await serviceWorker.ready;
    return registration?.pushManager ? registration : null;
  };

  const getState = async () => {
    const registration = await getRegistration();
    if (!registration) return { state: 'unsupported' };
    if (notificationApi.permission === 'denied') return { state: 'denied' };
    const existing = await registration.pushManager.getSubscription();
    return { state: existing ? 'subscribed' : 'default' };
  };

  return {
    getState,

    enable: async () => {
      const registration = await getRegistration();
      if (!registration) return { state: 'unsupported' };
      if (notificationApi.permission === 'denied') return { state: 'denied' };

      let permission = notificationApi.permission;
      if (permission !== 'granted') {
        permission = await notificationApi.requestPermission();
      }
      if (permission !== 'granted') {
        return { state: permission === 'denied' ? 'denied' : 'default' };
      }

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const publicKey = await api.getPushPublicKey();
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      await api.savePushSubscription(serializeSubscription(subscription));
      return { state: 'subscribed' };
    },

    disable: async () => {
      const registration = await getRegistration();
      if (!registration) return { state: 'unsupported' };
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return { state: 'default' };
      try {
        await api.deletePushSubscription(subscription.endpoint);
      } finally {
        await subscription.unsubscribe?.();
      }
      return { state: 'default' };
    },
  };
};
