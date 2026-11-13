import assert from 'node:assert/strict'
import test from 'node:test'
import { createApp } from '../src/server.js'

async function withServer(t, inventory) {
  const server = createApp(inventory)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  return `http://127.0.0.1:${server.address().port}`
}

function fakeInventory() {
  const reservations = new Map()
  return {
    calls: [],
    async health() {},
    async getWarehouses() {
      return [{ id: 1, name: 'Paris', capacityUnits: 100 }]
    },
    async createWarehouse(input) {
      this.calls.push(['createWarehouse', input])
      return { id: 2, ...input }
    },
    async getStock(filters) {
      this.calls.push(['getStock', filters])
      return [{ productId: 7, warehouseId: 1, availableQuantity: 12 }]
    },
    async setStock(input) {
      this.calls.push(['setStock', input])
      return { ...input, availableQuantity: input.quantity }
    },
    async reserve(input) {
      this.calls.push(['reserve', input])
      const existing = reservations.get(input.idempotencyKey)
      if (existing) return { reservation: existing, replayed: true }
      const reservation = {
        reservationId: '6a307c42-e58c-4c0f-b199-97b28cfe3819',
        orderId: input.orderId,
        status: 'reserved',
        items: input.items,
      }
      reservations.set(input.idempotencyKey, reservation)
      return { reservation, replayed: false }
    },
    async getReservation(reservationId) {
      return reservations.get(reservationId) ?? null
    },
    async transitionReservation(reservationId, status) {
      const reservation = [...reservations.values()].find(
        ({ reservationId: id }) => id === reservationId,
      )
      if (!reservation) return null
      reservation.status = status
      return reservation
    },
  }
}

test('health and stock reads return JSON and validate filters', async (t) => {
  const inventory = fakeInventory()
  const baseUrl = await withServer(t, inventory)
  const health = await fetch(`${baseUrl}/healthz`)
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { status: 'ok' })

  const response = await fetch(`${baseUrl}/v1/stock?productId=7`)
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).data[0], {
    productId: 7,
    warehouseId: 1,
    availableQuantity: 12,
  })
  assert.deepEqual(inventory.calls[0], ['getStock', { productId: 7, warehouseId: null }])

  const invalid = await fetch(`${baseUrl}/v1/stock?productId=zero`)
  assert.equal(invalid.status, 400)
  assert.equal((await invalid.json()).error.code, 'INVALID_INPUT')
})

test('warehouse and stock writes reject invalid values', async (t) => {
  const inventory = fakeInventory()
  const baseUrl = await withServer(t, inventory)

  const warehouse = await fetch(`${baseUrl}/v1/warehouses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: ' Lille ', capacityUnits: 20 }),
  })
  assert.equal(warehouse.status, 201)
  assert.deepEqual(inventory.calls[0], [
    'createWarehouse',
    { name: 'Lille', capacityUnits: 20 },
  ])

  const invalidStock = await fetch(`${baseUrl}/v1/stock`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ productId: 7, warehouseId: 1, quantity: -1 }),
  })
  assert.equal(invalidStock.status, 400)
  assert.equal((await invalidStock.json()).error.code, 'INVALID_INPUT')
})

test('reservations require valid quantities and an idempotency key', async (t) => {
  const baseUrl = await withServer(t, fakeInventory())
  const request = {
    orderId: 42,
    items: [{ productId: 7, warehouseId: 1, quantity: 2 }],
  }
  const missingKey = await fetch(`${baseUrl}/v1/reservations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  })
  assert.equal(missingKey.status, 400)
  assert.equal((await missingKey.json()).error.code, 'INVALID_IDEMPOTENCY_KEY')

  const duplicateItem = await fetch(`${baseUrl}/v1/reservations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'order-42-key' },
    body: JSON.stringify({
      ...request,
      items: [...request.items, ...request.items],
    }),
  })
  assert.equal(duplicateItem.status, 400)
  assert.equal((await duplicateItem.json()).error.code, 'DUPLICATE_ITEM')
})

test('reservation retry returns the prior reservation', async (t) => {
  const baseUrl = await withServer(t, fakeInventory())
  const options = {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'order-42-key' },
    body: JSON.stringify({
      orderId: 42,
      items: [{ productId: 7, warehouseId: 1, quantity: 2 }],
    }),
  }
  const first = await fetch(`${baseUrl}/v1/reservations`, options)
  const retry = await fetch(`${baseUrl}/v1/reservations`, options)
  assert.equal(first.status, 201)
  assert.equal(retry.status, 200)
  assert.deepEqual((await retry.json()).data, (await first.json()).data)
})

test('reservation transition routes validate IDs and return not found', async (t) => {
  const baseUrl = await withServer(t, fakeInventory())
  const invalid = await fetch(`${baseUrl}/v1/reservations/not-a-uuid/release`, { method: 'POST' })
  assert.equal(invalid.status, 400)
  assert.equal((await invalid.json()).error.code, 'INVALID_RESERVATION_ID')

  const missing = await fetch(
    `${baseUrl}/v1/reservations/6a307c42-e58c-4c0f-b199-97b28cfe3819/release`,
    { method: 'POST' },
  )
  assert.equal(missing.status, 404)
  assert.equal((await missing.json()).error.code, 'RESERVATION_NOT_FOUND')
})
