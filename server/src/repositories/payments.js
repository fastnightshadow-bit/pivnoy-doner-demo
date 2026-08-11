const mapPayment = (row) =>
  row
    ? {
        id: row.id,
        orderId: row.order_id,
        provider: row.provider,
        providerPaymentId: row.provider_payment_id,
        idempotencyKey: row.idempotency_key,
        status: row.status,
        amount: row.amount,
        currency: row.currency,
        providerPayload: row.provider_payload,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    : null;

export const createPaymentsRepository = (pool) => {
  const findByIdempotencyKey = async (key) => {
    const result = await pool.query(
      'select * from payments where idempotency_key = $1',
      [key],
    );
    return mapPayment(result.rows[0]);
  };

  return {
    findByIdempotencyKey,

    findByProviderPaymentId: async (providerPaymentId) => {
      const result = await pool.query(
        'select * from payments where provider_payment_id = $1',
        [providerPaymentId],
      );
      return mapPayment(result.rows[0]);
    },

    reserve: async (payment) => {
      const result = await pool.query(
        `insert into payments (
          id, order_id, provider, provider_payment_id, idempotency_key,
          status, amount, currency, provider_payload
        ) values ($1, $2, $3, null, $4, 'pending', $5, $6, '{}'::jsonb)
        on conflict (idempotency_key) do nothing
        returning *`,
        [
          payment.id,
          payment.orderId,
          payment.provider,
          payment.idempotencyKey,
          payment.amount,
          payment.currency,
        ],
      );
      return mapPayment(result.rows[0]) ??
        findByIdempotencyKey(payment.idempotencyKey);
    },

    completeReservation: async (payment) => {
      const result = await pool.query(
        `update payments
         set provider_payment_id = $3,
             status = $4,
             amount = $5,
             currency = $6,
             provider_payload = $7,
             updated_at = now()
         where idempotency_key = $1
           and order_id = $2
           and provider_payment_id is null
         returning *`,
        [
          payment.idempotencyKey,
          payment.orderId,
          payment.providerPaymentId,
          payment.status,
          payment.amount,
          payment.currency,
          payment.providerPayload,
        ],
      );
      return mapPayment(result.rows[0]) ??
        findByIdempotencyKey(payment.idempotencyKey);
    },

    create: async (payment) => {
    const result = await pool.query(
      `insert into payments (
        id, order_id, provider, provider_payment_id, idempotency_key,
        status, amount, currency, provider_payload
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      returning *`,
      [
        payment.id,
        payment.orderId,
        payment.provider,
        payment.providerPaymentId,
        payment.idempotencyKey,
        payment.status,
        payment.amount,
        payment.currency,
        payment.providerPayload,
      ],
    );
    return mapPayment(result.rows[0]);
    },

    applyVerifiedState: async ({ providerPaymentId, status, providerPayload }) => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const currentResult = await client.query(
        `select p.*, o.payment_status as order_payment_status, o.version
         from payments p
         join orders o on o.id = p.order_id
         where p.provider_payment_id = $1
         for update of p, o`,
        [providerPaymentId],
      );
      const current = currentResult.rows[0];
      if (!current) {
        await client.query('rollback');
        return null;
      }
      if (current.status === status && current.order_payment_status === status) {
        await client.query('rollback');
        return { applied: false, orderId: current.order_id, status };
      }

      await client.query(
        `update payments
         set status = $2, provider_payload = $3, updated_at = now()
         where provider_payment_id = $1`,
        [providerPaymentId, status, providerPayload],
      );
      const orderResult = await client.query(
        `update orders
         set payment_status = $2, version = version + 1, updated_at = now()
         where id = $1
         returning id, payment_status, status, version, updated_at`,
        [current.order_id, status],
      );
      const order = orderResult.rows[0];
      await client.query(
        `insert into event_outbox (
          aggregate_type, aggregate_id, event_type, payload
        ) values ('order', $1, 'payment.updated', $2)`,
        [
          current.order_id,
          {
            orderId: current.order_id,
            paymentStatus: status,
            status: order.status,
            version: order.version,
            updatedAt: order.updated_at,
          },
        ],
      );
      await client.query('commit');
      return { applied: true, orderId: current.order_id, status };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    },
  };
};
