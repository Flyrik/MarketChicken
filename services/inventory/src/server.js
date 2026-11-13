import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import pg from 'pg'
import { HttpError } from './errors.js'
import { createInventoryService } from './inventory-service.js'
import {
  parsePositiveInteger,
  validateReservation,
  validateReservationId,
  validateStock,
  validateWarehouse,
} from './validation.js'

const { Pool } = pg
const port = Number(process.env.PORT ?? 4001)

async function readJson(request) {
  const chunks = []
  let length = 0
  for await (const chunk of request) {
    length += chunk.length
    if (length > 1024 * 1024) {
      throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Le corps de la requête dépasse 1 Mo.')
    }
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Le corps de la requête doit être un JSON valide.')
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

export function createApp(inventory) {
  return createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost')
    try {
      if (request.method === 'GET' && url.pathname === '/healthz') {
        await inventory.health()
        sendJson(response, 200, { status: 'ok' })
        return
      }
      if (request.method === 'GET' && url.pathname === '/v1/warehouses') {
        sendJson(response, 200, { data: await inventory.getWarehouses() })
        return
      }
      if (request.method === 'POST' && url.pathname === '/v1/warehouses') {
        const warehouse = validateWarehouse(await readJson(request))
        sendJson(response, 201, { data: await inventory.createWarehouse(warehouse) })
        return
      }
      if (request.method === 'GET' && url.pathname === '/v1/stock') {
        const productId = url.searchParams.has('productId')
          ? parsePositiveInteger(url.searchParams.get('productId'), 'productId')
          : null
        const warehouseId = url.searchParams.has('warehouseId')
          ? parsePositiveInteger(url.searchParams.get('warehouseId'), 'warehouseId')
          : null
        sendJson(response, 200, { data: await inventory.getStock({ productId, warehouseId }) })
        return
      }
      if (request.method === 'PUT' && url.pathname === '/v1/stock') {
        const stock = validateStock(await readJson(request))
        sendJson(response, 200, { data: await inventory.setStock(stock) })
        return
      }
      if (request.method === 'POST' && url.pathname === '/v1/reservations') {
        const reservation = validateReservation(
          await readJson(request),
          request.headers['idempotency-key'],
        )
        const result = await inventory.reserve(reservation)
        sendJson(response, result.replayed ? 200 : 201, { data: result.reservation })
        return
      }

      const reservationMatch = url.pathname.match(/^\/v1\/reservations\/([^/]+)(?:\/(release|confirm))?$/)
      if (reservationMatch) {
        const reservationId = validateReservationId(reservationMatch[1])
        if (request.method === 'GET' && !reservationMatch[2]) {
          const reservation = await inventory.getReservation(reservationId)
          if (!reservation) throw new HttpError(404, 'RESERVATION_NOT_FOUND', 'Réservation introuvable.')
          sendJson(response, 200, { data: reservation })
          return
        }
        if (request.method === 'POST' && reservationMatch[2]) {
          const status = reservationMatch[2] === 'release' ? 'released' : 'confirmed'
          const reservation = await inventory.transitionReservation(reservationId, status)
          if (!reservation) throw new HttpError(404, 'RESERVATION_NOT_FOUND', 'Réservation introuvable.')
          sendJson(response, 200, { data: reservation })
          return
        }
      }

      throw new HttpError(404, 'NOT_FOUND', 'Route introuvable.')
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(response, error.status, { error: { code: error.code, message: error.message } })
        return
      }
      if (error.code === '23503') {
        sendJson(response, 404, {
          error: { code: 'WAREHOUSE_NOT_FOUND', message: 'Entrepôt introuvable.' },
        })
        return
      }
      console.error('Inventory request failed:', error)
      sendJson(response, 500, {
        error: { code: 'INTERNAL_ERROR', message: 'Une erreur interne est survenue.' },
      })
    }
  })
}

async function start() {
  const pool = new Pool({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? 'market',
    user: process.env.DB_USER ?? 'inventory_svc',
    password: process.env.DB_PASSWORD,
    connectionTimeoutMillis: 5000,
  })
  await pool.query('SELECT 1')
  const server = createApp({
    ...createInventoryService(pool),
    health: () => pool.query('SELECT 1'),
  })
  server.listen(port, '0.0.0.0', () => {
    console.log(`Inventory REST API listening on port ${port}`)
  })

  const shutdown = async () => {
    server.close()
    await pool.end()
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start().catch((error) => {
    console.error('Failed to start Inventory service:', error)
    process.exitCode = 1
  })
}
