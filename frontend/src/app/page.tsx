'use client'
import { useEffect } from 'react'

export default function Home() {
  useEffect(() => {
    fetch('https://sleepy-reef-25413-4f8e7dec33ad.herokuapp.com/')
      .then(response => response.text())
      .then(data => console.log(data))
      .catch(error => console.error('Error:', error))
  }, [])
  return <div>Check the console.</div>
}
