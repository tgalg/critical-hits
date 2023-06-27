import express from 'express'
import cors from 'cors'

const app = express()

// Set up CORS
app.use(
  cors({
    origin: 'http://localhost:3000', // allow to server to accept request from different origin
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, // allow session cookie from browser to pass through
  })
)

app.get('/', (req, res) => {
  res.send('Hello from the server!')
})

app.listen(5001, () => {
  console.log('Server is running on port 5001')
})
