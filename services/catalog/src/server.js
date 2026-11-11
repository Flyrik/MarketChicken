import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { GraphQLError, GraphQLScalarType, Kind } from 'graphql'
import { createYoga, createSchema } from 'graphql-yoga'
import { MongoClient, MongoServerError } from 'mongodb'

const databaseName = process.env.MONGO_DATABASE ?? 'market_catalog'
const mongoUri = new URL(
  `mongodb://${encodeURIComponent(process.env.MONGO_USERNAME)}:${encodeURIComponent(process.env.MONGO_PASSWORD)}@${process.env.MONGO_HOST ?? 'localhost'}:${process.env.MONGO_PORT ?? '27017'}/${databaseName}?authSource=${databaseName}`,
)
const port = Number(process.env.PORT ?? 4000)

const jsonScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'Valeur JSON libre pour les attributs variables des produits.',
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: (node) => {
    if (node.kind === Kind.OBJECT) {
      return Object.fromEntries(
        node.fields.map(({ name, value }) => [name.value, parseJsonLiteral(value)]),
      )
    }

    return parseJsonLiteral(node)
  },
})

function parseJsonLiteral(node) {
  switch (node.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return node.value
    case Kind.INT:
    case Kind.FLOAT:
      return Number(node.value)
    case Kind.NULL:
      return null
    case Kind.LIST:
      return node.values.map(parseJsonLiteral)
    case Kind.OBJECT:
      return Object.fromEntries(
        node.fields.map(({ name, value }) => [name.value, parseJsonLiteral(value)]),
      )
    default:
      throw new GraphQLError('Valeur JSON invalide.', {
        extensions: { code: 'BAD_USER_INPUT' },
      })
  }
}

export const typeDefs = /* GraphQL */ `
  scalar JSON

  enum ProductStatus {
    active
    inactive
  }

  type Product {
    productId: Int!
    name: String!
    category: String!
    priceCents: Int!
    status: ProductStatus!
    tags: [String!]!
    description: String
    attributes: JSON!
    indexedAt: String
  }

  input ProductInput {
    name: String!
    category: String!
    priceCents: Int!
    status: ProductStatus = active
    tags: [String!] = []
    description: String
    attributes: JSON = {}
  }

  input ProductUpdateInput {
    name: String
    category: String
    priceCents: Int
    status: ProductStatus
    tags: [String!]
    description: String
    attributes: JSON
  }

  type Query {
    products(category: String, status: ProductStatus = active, search: String): [Product!]!
    product(productId: Int!): Product
  }

  type Mutation {
    createProduct(input: ProductInput!): Product!
    updateProduct(productId: Int!, input: ProductUpdateInput!): Product
    archiveProduct(productId: Int!): Product
    deleteProduct(productId: Int!): Product
  }
`

function toProduct(document) {
  if (!document) return null
  return {
    productId: document.product_id,
    name: document.name,
    category: document.category,
    priceCents: document.price_cents,
    status: document.status,
    tags: document.tags ?? [],
    description: document.description ?? null,
    attributes: document.attributes ?? {},
    indexedAt: document.indexed_at?.toISOString() ?? null,
  }
}

function validateProductInput(input) {
  if (!input.name.trim() || !input.category.trim()) {
    throw new GraphQLError('Le nom et la catégorie ne peuvent pas être vides.', {
      extensions: { code: 'BAD_USER_INPUT' },
    })
  }

  if (!Number.isSafeInteger(input.priceCents) || input.priceCents < 0) {
    throw new GraphQLError('Le prix doit être un nombre entier positif en centimes.', {
      extensions: { code: 'BAD_USER_INPUT' },
    })
  }

  if (!input.attributes || typeof input.attributes !== 'object' || Array.isArray(input.attributes)) {
    throw new GraphQLError('Les attributs du produit doivent être un objet JSON.', {
      extensions: { code: 'BAD_USER_INPUT' },
    })
  }
}

function archiveProduct(catalog, productId) {
  return catalog.findOneAndUpdate(
    { product_id: productId },
    { $set: { status: 'inactive', indexed_at: new Date() } },
    { returnDocument: 'after' },
  )
}

export function createResolvers(catalog, sequences) {
  return {
    JSON: jsonScalar,
    Query: {
      products: async (_, { category, status, search }) => {
        const filter = {}
        if (category) filter.category = category
        if (status) filter.status = status
        if (search?.trim()) filter.$text = { $search: search.trim() }

        return (await catalog.find(filter).sort({ product_id: 1 }).toArray()).map(toProduct)
      },
      product: async (_, { productId }) =>
        toProduct(await catalog.findOne({ product_id: productId })),
    },
    Mutation: {
      createProduct: async (_, { input }) => {
        validateProductInput(input)
        const sequence = await sequences.findOneAndUpdate(
          { _id: 'product_id' },
          { $inc: { value: 1 } },
          { upsert: true, returnDocument: 'after' },
        )
        const product = {
          product_id: sequence.value,
          name: input.name.trim(),
          category: input.category.trim(),
          price_cents: input.priceCents,
          status: input.status ?? 'active',
          tags: input.tags ?? [],
          description: input.description ?? '',
          attributes: input.attributes ?? {},
          indexed_at: new Date(),
        }

        try {
          await catalog.insertOne(product)
        } catch (error) {
          if (error instanceof MongoServerError && error.code === 11000) {
            throw new GraphQLError('Un produit avec cet identifiant existe déjà.', {
              extensions: { code: 'CONFLICT' },
            })
          }
          throw error
        }

        return toProduct(product)
      },
      updateProduct: async (_, { productId, input }) => {
        const fields = Object.keys(input)
        if (fields.length === 0) {
          throw new GraphQLError('Fournissez au moins un champ à modifier.', {
            extensions: { code: 'BAD_USER_INPUT' },
          })
        }

        if (fields.some((field) => input[field] === null)) {
          throw new GraphQLError('Les champs fournis ne peuvent pas être nuls.', {
            extensions: { code: 'BAD_USER_INPUT' },
          })
        }

        const updates = {}
        if (input.name !== undefined) updates.name = input.name.trim()
        if (input.category !== undefined) updates.category = input.category.trim()
        if (input.priceCents !== undefined) {
          if (!Number.isSafeInteger(input.priceCents) || input.priceCents < 0) {
            throw new GraphQLError('Le prix doit être un nombre entier positif en centimes.', {
              extensions: { code: 'BAD_USER_INPUT' },
            })
          }
          updates.price_cents = input.priceCents
        }
        if (input.status !== undefined) updates.status = input.status
        if (input.tags !== undefined) updates.tags = input.tags
        if (input.description !== undefined) updates.description = input.description
        if (input.attributes !== undefined) updates.attributes = input.attributes
        if (
          input.attributes !== undefined &&
          (!input.attributes || typeof input.attributes !== 'object' || Array.isArray(input.attributes))
        ) {
          throw new GraphQLError('Les attributs du produit doivent être un objet JSON.', {
            extensions: { code: 'BAD_USER_INPUT' },
          })
        }
        if (updates.name === '' || updates.category === '') {
          throw new GraphQLError('Le nom et la catégorie ne peuvent pas être vides.', {
            extensions: { code: 'BAD_USER_INPUT' },
          })
        }
        updates.indexed_at = new Date()

        return toProduct(
          await catalog.findOneAndUpdate(
            { product_id: productId },
            { $set: updates },
            { returnDocument: 'after' },
          ),
        )
      },
      archiveProduct: async (_, { productId }) =>
        toProduct(await archiveProduct(catalog, productId)),
      deleteProduct: async (_, { productId }) =>
        toProduct(await archiveProduct(catalog, productId)),
    },
  }
}

async function start() {
  const client = new MongoClient(mongoUri.toString(), { serverSelectionTimeoutMS: 5000 })
  await client.connect()

  const database = client.db(databaseName)
  const catalog = database.collection('catalog')
  const sequences = database.collection('sequences')
  const yoga = createYoga({
    schema: createSchema({
      typeDefs,
      resolvers: createResolvers(catalog, sequences),
    }),
    graphqlEndpoint: '/graphql',
  })

  const server = createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/healthz') {
      try {
        await database.command({ ping: 1 })
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ status: 'ok' }))
      } catch {
        response.writeHead(503, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ status: 'unavailable' }))
      }
      return
    }

    yoga(request, response)
  })

  server.listen(port, '0.0.0.0', () => {
    console.log(`Catalog GraphQL API listening on port ${port}`)
  })

  const shutdown = async () => {
    server.close()
    await client.close()
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start().catch((error) => {
    console.error('Failed to start Catalog service:', error)
    process.exitCode = 1
  })
}
