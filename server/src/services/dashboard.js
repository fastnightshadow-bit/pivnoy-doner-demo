export const createDashboardService = ({ dashboard, settings }) => ({
  get: async () => ({
    ...(await dashboard.get()),
    settings: await settings.get(),
  }),
});
