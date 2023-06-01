import { PrismaClient } from '@prisma/client'
import { Session } from 'next-auth'
import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

const prisma = new PrismaClient()

// Extend the Session type
interface ExtendedSession extends Session {
  userId: string
}

export default NextAuth({
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials) {
          return null
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.username },
        })
        if (user && user.password === credentials.password) {
          return { id: user.id.toString(), name: user.name, email: user.email }
        } else {
          return null
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id.toString()
      }
      return token
    },
    async session({ session, token }) {
      const extendedSession = session as ExtendedSession // Cast session to ExtendedSession
      extendedSession.userId = token.id as string
      return extendedSession
    },
  },
})
