export const createDashboardRepository = (pool) => ({
  get: async () => {
    const result = await pool.query(
      `select
        count(*) filter (
          where payment_status = 'paid'
            and status not in ('completed', 'cancelled')
        )::int as active_orders,
        count(*) filter (
          where payment_status = 'paid'
            and status not in ('completed', 'cancelled')
            and created_at + (eta_max * interval '1 minute') < now()
        )::int as overdue_orders,
        coalesce(sum(total) filter (
          where payment_status = 'paid'
            and created_at >= date_trunc('day', now() at time zone 'Europe/Moscow') at time zone 'Europe/Moscow'
        ), 0)::int as revenue_today
       from orders`,
    );
    const row = result.rows[0] || {};
    return {
      activeOrders: Number(row.active_orders) || 0,
      overdueOrders: Number(row.overdue_orders) || 0,
      revenueToday: Number(row.revenue_today) || 0,
    };
  },
});
