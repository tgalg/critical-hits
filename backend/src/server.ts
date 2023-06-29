import express from 'express'
import cors from 'cors'

const app = express()
const port = process.env.PORT || 5001

// Set up CORS
app.use(
  cors({
    origin: 'https://critical-hits-frontend.vercel.app/', // allow server to accept request from different origin
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, // allow session cookie from browser to pass through
  })
)

app.get('/', (req, res) => {
  res.send('Hello from the server!')
})

app.listen(port, () => {
  console.log('Server is running on port 5001')
})
