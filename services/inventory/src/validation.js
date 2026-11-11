import { HttpError } from './errors.js'

export function parsePositiveInteger(value, field) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, 'INVALID_INPUT', `${field} doit être un entier positif.`)
  }
  return parsed
}

export function validateWarehouse(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'INVALID_INPUT', 'Le corps JSON doit être un objet.')
  }
  if (typeof input.name !== 'string' || !input.name.trim()) {
    throw new HttpError(400, 'INVALID_INPUT', 'Le nom de l’entrepôt est obligatoire.')
  }
  if (!Number.isSafeInteger(input.capacityUnits) || input.capacityUnits < 0) {
    throw new HttpError(400, 'INVALID_INPUT', 'capacityUnits doit être un entier positif ou nul.')
  }
  return { name: input.name.trim(), capacityUnits: input.capacityUnits }
}

export function validateStock(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'INVALID_INPUT', 'Le corps JSON doit être un objet.')
  }
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 0) {
    throw new HttpError(400, 'INVALID_INPUT', 'quantity doit être un entier positif ou nul.')
  }
  return {
    productId: parsePositiveInteger(input.productId, 'productId'),
    warehouseId: parsePositiveInteger(input.warehouseId, 'warehouseId'),
    quantity: input.quantity,
  }
}

export function validateReservation(input, idempotencyKey) {
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    throw new HttpError(
      400,
      'INVALID_IDEMPOTENCY_KEY',
      'L’en-tête Idempotency-Key est obligatoire (8 à 128 caractères).',
    )
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'INVALID_INPUT', 'Le corps JSON doit être un objet.')
  }
  const orderId = parsePositiveInteger(input.orderId, 'orderId')
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 100) {
    throw new HttpError(400, 'INVALID_INPUT', 'items doit contenir entre 1 et 100 lignes.')
  }

  const items = input.items.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new HttpError(400, 'INVALID_INPUT', 'Chaque ligne de réservation doit être un objet.')
    }
    return {
      productId: parsePositiveInteger(item.productId, 'productId'),
      warehouseId: parsePositiveInteger(item.warehouseId, 'warehouseId'),
      quantity: parsePositiveInteger(item.quantity, 'quantity'),
    }
  })

  const uniqueItems = new Set(items.map(({ productId, warehouseId }) => `${productId}:${warehouseId}`))
  if (uniqueItems.size !== items.length) {
    throw new HttpError(400, 'DUPLICATE_ITEM', 'Une ligne par produit et entrepôt est autorisée.')
  }

  items.sort((left, right) =>
    left.warehouseId - right.warehouseId || left.productId - right.productId,
  )
  return { orderId, items, idempotencyKey }
}

export function validateReservationId(value) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new HttpError(400, 'INVALID_RESERVATION_ID', 'Identifiant de réservation invalide.')
  }
  return value
}
