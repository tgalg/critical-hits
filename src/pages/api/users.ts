import { PrismaClient } from '@prisma/client'
import type { NextApiRequest, NextApiResponse } from 'next'

const prisma = new PrismaClient()

const getUsers = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const users = await prisma.user.findMany()
    res.status(200).json(users)
  } catch (error) {
    if (error instanceof Error) {
      res
        .status(500)
        .json({ error: `Sorry, an error occurred: ${error.message}` })
    } else {
      res.status(500).json({ error: 'An error occurred.' })
    }
  } finally {
    await prisma.$disconnect()
  }
}

export default getUsers
