import { createHash, randomUUID } from 'node:crypto'
import { HttpError } from './errors.js'

const reservationQuery = `
  SELECT id, idempotency_key, order_id, status, created_at, updated_at
  FROM inventory.reservations
  WHERE id = $1
`

async function loadReservation(client, reservationId) {
  const result = await client.query(reservationQuery, [reservationId])
  if (result.rowCount === 0) return null
  const reservation = result.rows[0]
  const items = await client.query(
    `SELECT product_id, warehouse_id, quantity
     FROM inventory.reservation_items
     WHERE reservation_id = $1
     ORDER BY warehouse_id, product_id`,
    [reservationId],
  )
  return {
    reservationId: reservation.id,
    idempotencyKey: reservation.idempotency_key,
    orderId: reservation.order_id,
    status: reservation.status,
    createdAt: reservation.created_at,
    updatedAt: reservation.updated_at,
    items: items.rows.map((item) => ({
      productId: item.product_id,
      warehouseId: item.warehouse_id,
      quantity: item.quantity,
    })),
  }
}

export function createInventoryService(pool) {
  return {
    async health() {
      await pool.query('SELECT 1')
    },

    async getWarehouses() {
      const result = await pool.query(
        `SELECT id, name, capacity_units AS "capacityUnits"
         FROM inventory.warehouses
         ORDER BY id`,
      )
      return result.rows
    },

    async getStock({ productId, warehouseId }) {
      const result = await pool.query(
        `SELECT stock.product_id AS "productId",
                stock.warehouse_id AS "warehouseId",
                warehouse.name AS "warehouseName",
                stock.quantity AS "availableQuantity",
                warehouse.capacity_units AS "capacityUnits"
         FROM inventory.stock AS stock
         JOIN inventory.warehouses AS warehouse ON warehouse.id = stock.warehouse_id
         WHERE ($1::integer IS NULL OR stock.product_id = $1)
           AND ($2::integer IS NULL OR stock.warehouse_id = $2)
         ORDER BY stock.warehouse_id, stock.product_id`,
        [productId ?? null, warehouseId ?? null],
      )
      return result.rows
    },

    async createWarehouse({ name, capacityUnits }) {
      try {
        const result = await pool.query(
          `INSERT INTO inventory.warehouses (name, capacity_units)
           VALUES ($1, $2)
           RETURNING id, name, capacity_units AS "capacityUnits"`,
          [name, capacityUnits],
        )
        return result.rows[0]
      } catch (error) {
        if (error.code === '23505') {
          throw new HttpError(409, 'WAREHOUSE_EXISTS', 'Un entrepôt porte déjà ce nom.')
        }
        throw error
      }
    },

    async setStock({ productId, warehouseId, quantity }) {
      const result = await pool.query(
        `INSERT INTO inventory.stock (product_id, warehouse_id, quantity)
         VALUES ($1, $2, $3)
         ON CONFLICT (product_id, warehouse_id)
         DO UPDATE SET quantity = EXCLUDED.quantity
         RETURNING product_id AS "productId",
                   warehouse_id AS "warehouseId",
                   quantity AS "availableQuantity"`,
        [productId, warehouseId, quantity],
      )
      return result.rows[0]
    },

    async reserve({ orderId, items, idempotencyKey }) {
      const requestHash = createHash('sha256')
        .update(JSON.stringify({ orderId, items }))
        .digest('hex')
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const reservationId = randomUUID()
        const inserted = await client.query(
          `INSERT INTO inventory.reservations
             (id, idempotency_key, request_hash, order_id, status)
           VALUES ($1, $2, $3, $4, 'reserved')
           ON CONFLICT (idempotency_key) DO NOTHING
           RETURNING id`,
          [reservationId, idempotencyKey, requestHash, orderId],
        )

        if (inserted.rowCount === 0) {
          const existing = await client.query(
            `SELECT id, request_hash
             FROM inventory.reservations
             WHERE idempotency_key = $1
             FOR UPDATE`,
            [idempotencyKey],
          )
          if (existing.rows[0].request_hash !== requestHash) {
            throw new HttpError(
              409,
              'IDEMPOTENCY_KEY_REUSED',
              'Cette clé Idempotency-Key a déjà été utilisée avec une autre demande.',
            )
          }
          const reservation = await loadReservation(client, existing.rows[0].id)
          await client.query('COMMIT')
          return { reservation, replayed: true }
        }

        for (const item of items) {
          const updated = await client.query(
            `UPDATE inventory.stock
             SET quantity = quantity - $1
             WHERE product_id = $2
               AND warehouse_id = $3
               AND quantity >= $1
             RETURNING product_id`,
            [item.quantity, item.productId, item.warehouseId],
          )
          if (updated.rowCount === 0) {
            throw new HttpError(
              409,
              'INSUFFICIENT_STOCK',
              `Stock absent ou insuffisant pour le produit ${item.productId} dans l’entrepôt ${item.warehouseId}.`,
            )
          }
          await client.query(
            `INSERT INTO inventory.reservation_items
               (reservation_id, product_id, warehouse_id, quantity)
             VALUES ($1, $2, $3, $4)`,
            [reservationId, item.productId, item.warehouseId, item.quantity],
          )
        }

        const reservation = await loadReservation(client, reservationId)
        await client.query('COMMIT')
        return { reservation, replayed: false }
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },

    async getReservation(reservationId) {
      return loadReservation(pool, reservationId)
    },

    async transitionReservation(reservationId, targetStatus) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await client.query(
          `SELECT status
           FROM inventory.reservations
           WHERE id = $1
           FOR UPDATE`,
          [reservationId],
        )
        if (result.rowCount === 0) {
          await client.query('ROLLBACK')
          return null
        }

        const currentStatus = result.rows[0].status
        if (currentStatus === targetStatus) {
          const reservation = await loadReservation(client, reservationId)
          await client.query('COMMIT')
          return reservation
        }
        if (currentStatus !== 'reserved') {
          throw new HttpError(
            409,
            'RESERVATION_ALREADY_FINAL',
            `La réservation est déjà ${currentStatus} et ne peut pas être ${targetStatus}.`,
          )
        }

        if (targetStatus === 'released') {
          const items = await client.query(
            `SELECT product_id, warehouse_id, quantity
             FROM inventory.reservation_items
             WHERE reservation_id = $1
             ORDER BY warehouse_id, product_id`,
            [reservationId],
          )
          for (const item of items.rows) {
            await client.query(
              `UPDATE inventory.stock
               SET quantity = quantity + $1
               WHERE product_id = $2 AND warehouse_id = $3`,
              [item.quantity, item.product_id, item.warehouse_id],
            )
          }
        }

        await client.query(
          `UPDATE inventory.reservations
           SET status = $2, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [reservationId, targetStatus],
        )
        const reservation = await loadReservation(client, reservationId)
        await client.query('COMMIT')
        return reservation
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },
  }
}
