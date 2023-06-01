import { signIn } from 'next-auth/react'
import { useState } from 'react'

const SignInForm = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = await signIn('credentials', {
      redirect: false,
      username,
      password,
    })
    if (result && result.error) {
      // Handle error here
      console.error(result.error)
    }
  }

  return (
    <form onSubmit={handleSubmit} className='flex flex-col space-y-4'>
      <label className='block'>
        <span className='text-gray-700'>Username</span>
        <input
          type='text'
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className='mt-1 block w-full rounded-md border-transparent bg-gray-100 focus:border-gray-500 focus:bg-white focus:ring-0'
          placeholder='Username'
        />
      </label>
      <label className='block'>
        <span className='text-gray-700'>Password</span>
        <input
          type='password'
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className='mt-1 block w-full rounded-md border-transparent bg-gray-100 focus:border-gray-500 focus:bg-white focus:ring-0'
          placeholder='Password'
        />
      </label>
      <button
        type='submit'
        className='bg-primary-600 hover:bg-primary-500 focus:border-primary-700 focus:shadow-outline-primary active:bg-primary-700 inline-flex items-center rounded-md border border-transparent px-4 py-2 text-base font-medium leading-6 text-white transition duration-150 ease-in-out focus:outline-none'
      >
        Sign In
      </button>
    </form>
  )
}

export default SignInForm
