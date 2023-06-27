'use client'
import { useEffect } from 'react'

export default function Home() {
  useEffect(() => {
    fetch('http://localhost:5001')
      .then(response => response.text())
      .then(data => console.log(data))
      .catch(error => console.error('Error:', error))
  }, [])
  return <div>Check the console.</div>
}
