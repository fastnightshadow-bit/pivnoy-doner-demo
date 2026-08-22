const formatCourierPushAddress = (address = {}) =>
  [
    String(address.street ?? '').trim(),
    address.entrance ? `подъезд ${String(address.entrance).trim()}` : '',
    address.floor ? `этаж ${String(address.floor).trim()}` : '',
    address.apartment ? `кв. ${String(address.apartment).trim()}` : '',
    address.intercom ? `домофон ${String(address.intercom).trim()}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

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

const mapRefund = (row) =>
  row
    ? {
        orderId: row.order_id,
        paymentId: row.payment_id,
        providerPaymentId: row.provider_payment_id,
        providerRefundId: row.provider_refund_id,
        idempotencyKey: row.idempotency_key,
        status: row.status,
        amount: row.amount,
        currency: row.currency,
        reason: row.reason,
        requestedBy: row.requested_by,
        attempt: row.attempt,
        providerPayload: row.provider_payload,
        lastError: row.last_error,
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

    findPaidByOrderId: async (orderId) => {
      const result = await pool.query(
        `select * from payments
         where order_id = $1 and status = 'paid'
           and provider_payment_id is not null
         order by updated_at desc
         limit 1`,
        [orderId],
      );
      return mapPayment(result.rows[0]);
    },

    findRefundByOrderId: async (orderId) => {
      const result = await pool.query(
        'select * from refund_operations where order_id = $1',
        [orderId],
      );
      return mapRefund(result.rows[0]);
    },

    findRefundByProviderRefundId: async (providerRefundId) => {
      const result = await pool.query(
        `select r.*, p.provider_payment_id
         from refund_operations r
         join payments p on p.id = r.payment_id
         where r.provider_refund_id = $1`,
        [providerRefundId],
      );
      return mapRefund(result.rows[0]);
    },

    reserveRefund: async (refund) => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const currentResult = await client.query(
          'select * from refund_operations where order_id = $1 for update',
          [refund.orderId],
        );
        const current = currentResult.rows[0];
        if (current && current.status !== 'failed') {
          await client.query('commit');
          return mapRefund(current);
        }

        const result = current
          ? await client.query(
              `update refund_operations
               set idempotency_key = $2,
                   status = 'pending',
                   reason = $3,
                   requested_by = $4,
                   attempt = attempt + 1,
                   provider_payload = '{}'::jsonb,
                   provider_refund_id = null,
                   last_error = null,
                   updated_at = now()
               where order_id = $1
               returning *`,
              [
                refund.orderId,
                refund.idempotencyKey,
                refund.reason,
                refund.requestedBy,
              ],
            )
          : await client.query(
              `insert into refund_operations (
                 order_id, payment_id, idempotency_key, status, amount,
                 currency, reason, requested_by
               ) values ($1, $2, $3, 'pending', $4, $5, $6, $7)
               returning *`,
              [
                refund.orderId,
                refund.paymentId,
                refund.idempotencyKey,
                refund.amount,
                refund.currency,
                refund.reason,
                refund.requestedBy,
              ],
            );
        await client.query('commit');
        return mapRefund(result.rows[0]);
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },

    completeRefund: async ({
      orderId,
      idempotencyKey,
      providerRefundId,
      status,
      providerPayload,
    }) => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await client.query(
          `update refund_operations
           set provider_refund_id = $3,
               status = $4,
               provider_payload = $5,
               last_error = null,
               updated_at = now()
           where order_id = $1 and idempotency_key = $2
           returning *`,
          [orderId, idempotencyKey, providerRefundId, status, providerPayload],
        );
        const refund = result.rows[0];
        if (!refund) {
          await client.query('rollback');
          return null;
        }
        if (status === 'succeeded') {
          await client.query(
            `update payments set status = 'refunded', updated_at = now()
             where id = $1`,
            [refund.payment_id],
          );
          const orderResult = await client.query(
            `update orders
             set payment_status = 'refunded', version = version + 1,
                 updated_at = now()
             where id = $1
             returning version, updated_at`,
            [orderId],
          );
          await client.query(
            `insert into event_outbox (
               aggregate_type, aggregate_id, event_type, payload
             ) values ('order', $1, 'refund.updated', $2)`,
            [
              orderId,
              {
                orderId,
                refundStatus: status,
                paymentStatus: 'refunded',
                version: orderResult.rows[0]?.version,
                updatedAt: orderResult.rows[0]?.updated_at,
              },
            ],
          );
        }
        await client.query('commit');
        return mapRefund(refund);
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },

    noteRefundError: async ({ orderId, idempotencyKey, lastError }) => {
      const result = await pool.query(
        `update refund_operations
         set last_error = $3, updated_at = now()
         where order_id = $1 and idempotency_key = $2
         returning *`,
        [orderId, idempotencyKey, lastError],
      );
      return mapRefund(result.rows[0]);
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
        `select p.*, o.payment_status as order_payment_status, o.version,
                o.fulfillment, o.public_number, o.address,
                o.eta_min, o.eta_max
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
      if (status === 'paid' && current.fulfillment === 'delivery') {
        await client.query(
          `insert into push_jobs (event_key, order_id, payload)
           values ($1, $2, $3)
           on conflict (event_key) do nothing`,
          [
            `courier.order_paid:${current.order_id}`,
            current.order_id,
            {
              orderId: current.order_id,
              number: String(current.public_number),
              eta: {
                min: Number(current.eta_min),
                max: Number(current.eta_max),
              },
              address: formatCourierPushAddress(current.address),
              url: '/courier.html',
            },
          ],
        );
      }
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
