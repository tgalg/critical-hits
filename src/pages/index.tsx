import * as React from 'react'
import { useEffect, useState } from 'react'

import Layout from '@/components/layout/Layout'
import UnderlineLink from '@/components/links/UnderlineLink'
import Seo from '@/components/Seo'
/**
 * SVGR Support
 * Caveat: No React Props Type.
 *
 * You can override the next-env if the type is important to you
 * @see https://stackoverflow.com/questions/68103844/how-to-override-next-js-svg-module-declaration
 */
import SignInForm from '@/components/SignIn'

import Vercel from '~/svg/Vercel.svg'

// !STARTERCONF -> Select !STARTERCONF and CMD + SHIFT + F
// Before you begin editing, follow all comments with `STARTERCONF`,
// to customize the default configuration.

type User = {
  id: number
  name: string
  email: string
  // Add other fields as necessary
}

export default function HomePage() {
  const [users, setUsers] = useState<User[]>([])

  useEffect(() => {
    const fetchUsers = async () => {
      const res = await fetch('/api/users')
      const data = await res.json()
      setUsers(data)
    }

    fetchUsers()
  }, [])

  return (
    <Layout>
      {/* <Seo templateTitle='Home' /> */}
      <Seo />

      <main>
        <section className='bg-dark'>
          <div className='layout relative flex min-h-screen flex-col items-center justify-center py-12 text-center'>
            <Vercel className='border-rounded bg-primary-500 border text-5xl' />
            <h1 className='text-primary-500 mt-4'>Critical Hits</h1>

            <div>
              <h1 className='text-primary-300'>Users</h1>
              <ul>
                {users.map((user) => (
                  <li className='text-primary-100' key={user.id}>
                    {user.name}
                  </li>
                ))}
              </ul>
            </div>

            <SignInForm />

            <footer className='absolute bottom-2 text-gray-700'>
              © {new Date().getFullYear()} By{' '}
              <UnderlineLink href='https://theodorusclarence.com?ref=tsnextstarter'>
                Tom Gallagher
              </UnderlineLink>
            </footer>
          </div>
        </section>
      </main>
    </Layout>
  )
}
