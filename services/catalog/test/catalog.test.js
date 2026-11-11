import assert from 'node:assert/strict'
import test from 'node:test'
import { graphql } from 'graphql'
import { createSchema } from 'graphql-yoga'
import { createResolvers, typeDefs } from '../src/server.js'

function createTestApi(initialProducts = []) {
  const products = structuredClone(initialProducts)
  let nextProductId = Math.max(0, ...products.map(({ product_id }) => product_id))
  const catalog = {
    find(filter) {
      return {
        sort() {
          return {
            async toArray() {
              return products
                .filter((product) => {
                  if (filter.category && product.category !== filter.category) return false
                  if (filter.status && product.status !== filter.status) return false
                  if (filter.$text) {
                    const searchable = `${product.name} ${product.description ?? ''}`.toLowerCase()
                    if (!searchable.includes(filter.$text.$search.toLowerCase())) return false
                  }
                  return true
                })
                .sort((left, right) => left.product_id - right.product_id)
                .map((product) => structuredClone(product))
            },
          }
        },
      }
    },
    async findOne(filter) {
      const product = products.find(({ product_id }) => product_id === filter.product_id)
      return product ? structuredClone(product) : null
    },
    async insertOne(product) {
      products.push(structuredClone(product))
    },
    async findOneAndUpdate(filter, update) {
      const product = products.find(({ product_id }) => product_id === filter.product_id)
      if (!product) return null
      Object.assign(product, update.$set)
      return structuredClone(product)
    },
  }
  const sequences = {
    async findOneAndUpdate(_, update) {
      nextProductId += update.$inc.value
      return { value: nextProductId }
    },
  }
  const schema = createSchema({ typeDefs, resolvers: createResolvers(catalog, sequences) })

  return {
    products,
    execute(source, variableValues) {
      return graphql({ schema, source, variableValues })
    },
  }
}

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

const existingProducts = [
  {
    product_id: 1,
    name: 'Poulet fermier',
    category: 'filets',
    price_cents: 899,
    status: 'active',
    tags: ['bio'],
    description: 'Filets frais',
    attributes: { weight_g: 400 },
    indexed_at: new Date('2026-01-01T00:00:00.000Z'),
  },
  {
    product_id: 2,
    name: 'Poulet archive',
    category: 'rotisserie',
    price_cents: 999,
    status: 'inactive',
    attributes: {},
  },
]

test('lists products using category, status, and text filters', async () => {
  const api = createTestApi(existingProducts)
  const result = await api.execute(`
    query {
      products(category: "filets", status: active, search: "frais") {
        productId
        name
        indexedAt
      }
    }
  `)

  assert.equal(result.errors, undefined)
  assert.deepEqual(plain(result.data.products), [
    {
      productId: 1,
      name: 'Poulet fermier',
      indexedAt: '2026-01-01T00:00:00.000Z',
    },
  ])
})

test('returns null when a product does not exist', async () => {
  const api = createTestApi()
  const result = await api.execute('query { product(productId: 404) { productId } }')

  assert.equal(result.errors, undefined)
  assert.equal(result.data.product, null)
})

test('creates a product with an assigned ID and indexing date', async () => {
  const api = createTestApi(existingProducts)
  const result = await api.execute(
    `mutation Create($input: ProductInput!) {
      createProduct(input: $input) {
        productId name category priceCents status tags attributes indexedAt
      }
    }`,
    {
      input: {
        name: '  Poulet bio  ',
        category: ' filets ',
        priceCents: 1099,
        tags: ['bio'],
        attributes: { weight_g: 500 },
      },
    },
  )

  assert.equal(result.errors, undefined)
  assert.equal(result.data.createProduct.productId, 3)
  assert.equal(result.data.createProduct.name, 'Poulet bio')
  assert.equal(result.data.createProduct.category, 'filets')
  assert.equal(result.data.createProduct.status, 'active')
  assert.ok(result.data.createProduct.indexedAt)
  assert.equal(api.products.length, 3)
})

test('rejects invalid product values without writing a product', async (t) => {
  const invalidInputs = [
    ['blank name', { name: ' ', category: 'filets', priceCents: 500, attributes: {} }],
    ['blank category', { name: 'Produit', category: ' ', priceCents: 500, attributes: {} }],
    ['negative price', { name: 'Produit', category: 'filets', priceCents: -1, attributes: {} }],
    ['non-object attributes', { name: 'Produit', category: 'filets', priceCents: 500, attributes: [] }],
  ]

  for (const [label, input] of invalidInputs) {
    await t.test(label, async () => {
      const api = createTestApi()
      const result = await api.execute(
        'mutation Create($input: ProductInput!) { createProduct(input: $input) { productId } }',
        { input },
      )

      assert.equal(result.errors?.[0].extensions.code, 'BAD_USER_INPUT')
      assert.equal(api.products.length, 0)
    })
  }
})

test('updates only supplied fields and returns null for an unknown product', async () => {
  const api = createTestApi(existingProducts)
  const result = await api.execute(`
    mutation {
      updateProduct(productId: 1, input: { priceCents: 1200 }) {
        productId
        name
        priceCents
      }
    }
  `)

  assert.equal(result.errors, undefined)
  assert.deepEqual(plain(result.data.updateProduct), {
    productId: 1,
    name: 'Poulet fermier',
    priceCents: 1200,
  })

  const missing = await api.execute(`
    mutation {
      updateProduct(productId: 404, input: { priceCents: 1200 }) { productId }
    }
  `)
  assert.equal(missing.errors, undefined)
  assert.equal(missing.data.updateProduct, null)
})

test('rejects empty or invalid updates without modifying the product', async (t) => {
  const invalidInputs = [
    ['empty update', {}],
    ['null field', { name: null }],
    ['negative price', { priceCents: -1 }],
    ['blank name', { name: ' ' }],
    ['non-object attributes', { attributes: ['invalid'] }],
  ]

  for (const [label, input] of invalidInputs) {
    await t.test(label, async () => {
      const api = createTestApi(existingProducts)
      const result = await api.execute(
        `mutation Update($input: ProductUpdateInput!) {
          updateProduct(productId: 1, input: $input) { productId }
        }`,
        { input },
      )

      assert.equal(result.errors?.[0].extensions.code, 'BAD_USER_INPUT')
      assert.equal(api.products[0].price_cents, 899)
      assert.equal(api.products[0].name, 'Poulet fermier')
    })
  }
})

test('archives and deletes by marking products inactive without removing them', async () => {
  const api = createTestApi(existingProducts)
  const archived = await api.execute(`
    mutation { archiveProduct(productId: 1) { productId status } }
  `)

  assert.equal(archived.errors, undefined)
  assert.deepEqual(plain(archived.data.archiveProduct), { productId: 1, status: 'inactive' })
  assert.equal(api.products.length, 2)

  const deleted = await api.execute(`
    mutation { deleteProduct(productId: 2) { productId status } }
  `)
  assert.equal(deleted.errors, undefined)
  assert.deepEqual(plain(deleted.data.deleteProduct), { productId: 2, status: 'inactive' })
  assert.equal(api.products.length, 2)
})
