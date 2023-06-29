'use client'
import { useEffect, useState } from 'react'

const Home: React.FC = () => {
  const [data, setData] = useState<string | null>(null)

  useEffect(() => {
    fetch('https://sleepy-reef-25413-4f8e7dec33ad.herokuapp.com/')
      .then(response => response.text())
      .then(data => {
        console.log(data)
        setData(data) // set the data into state
      })
      .catch(error => console.error('Error:', error))
  }, [])

  // render the fetched data
  return (
    <div>
      <h1>Data fetched from backend:</h1>
      {data ? <p>{data}</p> : <p>Loading...</p>}
    </div>
  )
}

export default Home
