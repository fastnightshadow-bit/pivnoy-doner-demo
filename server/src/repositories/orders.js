import { randomUUID } from 'node:crypto';

const mapOrder = (row) => ({
  id: row.id,
  number: String(row.public_number),
  idempotencyKey: row.idempotency_key,
  status: row.status,
  paymentStatus: row.payment_status,
  source: row.source || 'web',
  serviceMode: row.service_mode || null,
  kioskDeviceId: row.kiosk_device_id || null,
  fulfillment: row.fulfillment,
  customerName: row.customer_name,
  phone: row.phone,
  address: row.address,
  comment: row.customer_comment,
  courierComment: row.courier_comment,
  itemsTotal: row.items_total,
  deliveryTotal: row.delivery_total,
  discountTotal: row.discount_total,
  total: row.total,
  eta: { min: row.eta_min, max: row.eta_max },
  version: row.version,
  createdAt: row.created_at,
  personalDataConsentAt: row.personal_data_consent_at,
  personalDataConsentVersion: row.personal_data_consent_version,
  offerVersion: row.offer_version,
  accessTokenHash: row.access_token_hash,
  items: Array.isArray(row.items)
    ? row.items.map((item) => ({
        lineId: item.id,
        productId: item.product_id,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        ...(item.configuration || {}),
      }))
    : undefined,
});

export const createOrdersRepository = (pool) => ({
  findById: async (id) => {
    const result = await pool.query(
      `select o.*,
        coalesce(
          json_agg(oi order by oi.id) filter (where oi.id is not null),
          '[]'
        ) as items
       from orders o
       left join order_items oi on oi.order_id = o.id
       where o.id = $1
       group by o.id`,
      [id],
    );
    return result.rows[0] ? mapOrder(result.rows[0]) : null;
  },

  findByIdempotencyKey: async (key) => {
    const result = await pool.query(
      'select * from orders where idempotency_key = $1',
      [key],
    );
    return result.rows[0] ? mapOrder(result.rows[0]) : null;
  },

  create: async (order) => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const result = await client.query(
        `insert into orders (
          id, idempotency_key, status, fulfillment, payment_status,
          source, service_mode, kiosk_device_id,
          customer_name, phone, address, customer_comment, courier_comment,
          items_total, delivery_total, discount_total, total,
          eta_min, eta_max, version, created_at, updated_at,
          personal_data_consent_at, personal_data_consent_version,
          offer_version, access_token_hash
        ) values (
          $1, $2, $3, $4, $5,
          $6, $7, $8,
          $9, $10, $11, $12, $13,
          $14, $15, $16, $17,
          $18, $19, $20, $21, $21,
          $22, $23, $24, $25
        ) returning *`,
        [
          order.id,
          order.idempotencyKey,
          order.status,
          order.fulfillment,
          order.paymentStatus,
          order.source || 'web',
          order.serviceMode || null,
          order.kioskDeviceId || null,
          order.customerName,
          order.phone,
          order.address,
          order.customerComment,
          order.courierComment,
          order.itemsTotal,
          order.deliveryTotal,
          order.discountTotal,
          order.total,
          order.eta.min,
          order.eta.max,
          order.version,
          order.createdAt,
          order.personalDataConsentAt,
          order.personalDataConsentVersion,
          order.offerVersion,
          order.accessTokenHash,
        ],
      );

      for (const item of order.items) {
        await client.query(
          `insert into order_items (
            id, order_id, product_id, name, quantity, unit_price, configuration
          ) values ($1, $2, $3, $4, $5, $6, $7)`,
          [
            randomUUID(),
            order.id,
            item.productId,
            item.name,
            item.quantity,
            item.unitPrice,
            item.configuration,
          ],
        );
      }

      await client.query(
        `insert into status_history (
          order_id, previous_status, new_status, actor_name
        ) values ($1, null, $2, 'Клиент')`,
        [order.id, order.status],
      );
      await client.query('commit');
      return { ...mapOrder(result.rows[0]), items: order.items };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  },
});
