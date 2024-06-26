import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { knex } from '../database'
import { randomUUID } from 'crypto'
import { checkSessionIdExists } from '../middlewares/check-session-id-exists'

export async function usersRoutes(app: FastifyInstance) {
  // Login
  app.post('/login', async (request, reply) => {
    const loginBodySchema = z.object({
      email: z.string(),
      password: z.string(),
    })

    const { email, password } = loginBodySchema.parse(request.body)

    const user = await knex('users')
      .select('password', 'session_id')
      .where('email', email)

    if (user.length === 0) {
      return reply.status(400).send('Email not found')
    } else if (user[0].password === password) {
      reply.cookie('sessionId', user[0].session_id, {
        path: '/',
        maxAge: 60 * 60 * 3, // 3 hours
      })

      return reply.status(200).send()
    }
    return reply.status(400).send('Incorrect password')
  })

  // Create User - Signup
  app.post('/signup', async (request, reply) => {
    const createUserBodySchema = z.object({
      username: z.string(),
      email: z.string(),
      password: z.string(),
    })

    const { username, email, password } = createUserBodySchema.parse(
      request.body,
    )

    let sessionId = request.cookies.sessionId
    if (!sessionId) {
      sessionId = randomUUID()

      reply.cookie('sessionId', sessionId, {
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      })
    }

    await knex('users').insert({
      id: randomUUID(),
      session_id: sessionId,
      username,
      email,
      password,
    })

    await knex('metrics').insert({
      id: randomUUID(),
      session_id: sessionId,
      meal_amount: 0,
      diet_amount: 0,
      not_diet_amount: 0,
      diet_sequence: 0,
      longest_sequence: 0,
    })

    return reply.status(201).send()
  })

  // Update credentials
  app.put(
    '/update',
    {
      preHandler: [checkSessionIdExists],
    },
    async (request, reply) => {
      const { sessionId } = request.cookies
      const updateUserBodySchema = z.object({
        username: z.string().optional(),
        email: z.string().optional(),
        password: z.string(),
        new_password: z.string().optional(),
      })

      const {
        username,
        email,
        password,
        new_password: newPassword,
      } = updateUserBodySchema.parse(request.body)

      const currentUserData = await knex('users')
        .select('username', 'email', 'password')
        .where('session_id', sessionId)

      if (currentUserData[0].password === password) {
        username &&
          (await knex('users')
            .where('session_id', sessionId)
            .update({ username, updated_at: knex.fn.now() }))

        email &&
          (await knex('users')
            .where('session_id', sessionId)
            .update({ email, updated_at: knex.fn.now() }))

        newPassword &&
          (await knex('users')
            .where('session_id', sessionId)
            .update({ password: newPassword, updated_at: knex.fn.now() }))

        return reply.status(200).send()
      }
      return reply.status(400).send('Incorrect password')
    },
  )
}
