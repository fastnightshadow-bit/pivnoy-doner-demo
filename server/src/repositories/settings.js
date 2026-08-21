export const createSettingsRepository = (pool) => ({
  get: async () => {
    const [settingsResult, stoppedResult, stoppedOptionsResult] = await Promise.all([
      pool.query('select * from restaurant_settings where singleton = true'),
      pool.query(
        `select product_id from catalog_products
         where available = false
         order by product_id`,
      ),
      pool.query(
        `select option_kind, option_id from catalog_option_availability
         where available = false
         order by option_kind, option_id`,
      ),
    ]);
    const row = settingsResult.rows[0] || {};
    return {
      acceptingOrders: row.accepting_orders !== false,
      deliveryPrice: Number(row.delivery_price) || 200,
      freeDeliveryFrom: Number(row.free_delivery_from) || 2000,
      minimumDeliveryOrder: Number(row.minimum_delivery_order) || 300,
      deliveryOpens: String(row.delivery_opens || '11:30').slice(0, 5),
      deliveryCloses: String(row.delivery_closes || '22:30').slice(0, 5),
      stoppedProductIds: stoppedResult.rows.map((item) => item.product_id),
      stoppedMeatIds: stoppedOptionsResult.rows
        .filter((item) => item.option_kind === 'meat')
        .map((item) => item.option_id),
      stoppedSauceIds: stoppedOptionsResult.rows
        .filter((item) => item.option_kind === 'sauce')
        .map((item) => item.option_id),
      stoppedAddonIds: stoppedOptionsResult.rows
        .filter((item) => item.option_kind === 'addon')
        .map((item) => item.option_id),
    };
  },

  update: async (value, account) => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(
        `update restaurant_settings
         set accepting_orders = $1, updated_by = $2, updated_at = now()
         where singleton = true`,
        [Boolean(value.acceptingOrders), account.id],
      );
      await client.query(
        `insert into event_outbox (
          aggregate_type, aggregate_id, event_type, payload
        ) values ('settings', 'restaurant', 'settings.updated', $1)`,
        [{ acceptingOrders: Boolean(value.acceptingOrders) }],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  },

  setAvailability: async (product, available, account) => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(
        `insert into catalog_products (
          product_id, name, category, available, configuration, updated_by
        ) values ($1, $2, $3, $4, $5, $6)
        on conflict (product_id) do update
        set available = excluded.available,
            updated_by = excluded.updated_by,
            updated_at = now()`,
        [
          product.id,
          product.name,
          product.category,
          Boolean(available),
          product,
          account.id,
        ],
      );
      await client.query(
        `insert into event_outbox (
          aggregate_type, aggregate_id, event_type, payload
        ) values ('catalog', $1, 'settings.updated', $2)`,
        [product.id, { productId: product.id, available: Boolean(available) }],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  },

  setCategoryAvailability: async (categoryId, products, available, account) => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      for (const product of products) {
        await client.query(
          `insert into catalog_products (
            product_id, name, category, available, configuration, updated_by
          ) values ($1, $2, $3, $4, $5, $6)
          on conflict (product_id) do update
          set available = excluded.available,
              updated_by = excluded.updated_by,
              updated_at = now()`,
          [
            product.id,
            product.name,
            product.category,
            Boolean(available),
            product,
            account.id,
          ],
        );
      }
      await client.query(
        `insert into event_outbox (
          aggregate_type, aggregate_id, event_type, payload
        ) values ('catalog-category', $1, 'settings.updated', $2)`,
        [categoryId, {
          categoryId,
          productIds: products.map(({ id }) => id),
          available: Boolean(available),
        }],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  },

  setOptionAvailability: async (kind, optionId, available, account) => {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(
        `insert into catalog_option_availability (
          option_kind, option_id, available, updated_by
        ) values ($1, $2, $3, $4)
        on conflict (option_kind, option_id) do update
        set available = excluded.available,
            updated_by = excluded.updated_by,
            updated_at = now()`,
        [kind, optionId, Boolean(available), account.id],
      );
      await client.query(
        `insert into event_outbox (
          aggregate_type, aggregate_id, event_type, payload
        ) values ('catalog-option', $1, 'settings.updated', $2)`,
        [
          `${kind}:${optionId}`,
          { kind, optionId, available: Boolean(available) },
        ],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  },
});
