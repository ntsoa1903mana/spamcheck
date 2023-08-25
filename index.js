// index.js
const express = require('express');
const axios = require('axios');
const Redis = require('ioredis');
const cron = require('node-cron'); // Import the node-cron library
require('dotenv').config();

const TOKEN = process.env.TOKEN;
const PAGE_ID = process.env.PAGE_ID;
const REDIS_URL = process.env.REDIS_URL;

// Create a Redis client with the connection using REDIS_URL
const redisClient = new Redis(REDIS_URL);

// Function to check if a key matches the 10-digit number format
function isValid10DigitNumberKey(key) {
  return /^\d{10}$/.test(key);
}

const sendMessage = async (senderId) => {
  try {
    const options = {
      method: 'POST',
      url: `https://graph.facebook.com/v11.0/${PAGE_ID}/messages`,
      params: {
        access_token: TOKEN,
      },
      data: {
        recipient: { id: senderId },
        messaging_type: 'RESPONSE',
        message: {
          text: 'Désolé, votre abonnement n\'a pas été activé. Veuillez vérifier le numéro que vous avez fourni ou nous contacter.',
        },
      },
    };

    const response = await axios(options);

    console.log('Message sent successfully');
    return true;
  } catch (error) {
    console.error('Error occurred while sending message:', error);
    return false;
  }
};

async function sendMessagesToNumbers() {
  try {
    let cursor = '0';
    const oneDayInMilliseconds = 24 * 60 * 60 * 1000; // 1 day in milliseconds

    // Get the current date in milliseconds
    const currentDateInMs = Date.now();

    // Loop until SCAN returns '0' (end of iteration)
    do {
      // Use the SCAN command to get a batch of keys (numbers) with 10-digit format
      const [newCursor, keys] = await redisClient.scan(cursor, 'MATCH', '??????????');

      // Update the cursor for the next iteration
      cursor = newCursor;

      // Send messages to each number (key) in the current batch
      for (const key of keys) {
        if (!isValid10DigitNumberKey(key)) {
          console.log(`Invalid key format: ${key}. Skipping...`);
          continue;
        }

        try {
          const numberData = await redisClient.hgetall(key);
          const { fbid, receivedate } = numberData;

          if (!fbid) {
            console.error(`Missing fbid for key: ${key}`);
            continue;
          }

          // Calculate the time difference between receive date and current date
          const receiveDateInMs = Date.parse(receivedate);
          const timeDifferenceInMs = currentDateInMs - receiveDateInMs;

          // If the time difference is greater than 1 day, send the post request
          if (timeDifferenceInMs >= oneDayInMilliseconds) {
            const success = await sendMessage(fbid);
            if (success) {
              console.log(`Message sent successfully to fbid: ${fbid}`);
              // Delete the data related to fbid in Redis after sending the message successfully
              await redisClient.del(key); // Delete the key and its associated data
            } else {
              console.error(`Failed to send message to fbid: ${fbid}`);
            }
          } else {
            console.log(`Message for fbid: ${fbid} not sent. Receive date within 1 day.`);
          }
        } catch (error) {
          console.error(`Error processing key: ${key}`, error);
        }
      }
    } while (cursor !== '0'); // Loop until the end of iteration

  } catch (error) {
    console.error('Error sending messages:', error);
  }
}

const app = express();

// Endpoint to trigger the sending of messages to numbers
app.post('/trigger-send-messages', async (req, res) => {
  try {
    // Call the function to send messages to numbers
    await sendMessagesToNumbers();
    res.status(200).json({ message: 'Messages sending process initiated.' });
  } catch (error) {
    console.error('Error sending messages:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Endpoint to trigger the sendRequest function
app.get('/trigger-send-request', async (req, res) => {
  try {
    // Call the sendRequest function
    await sendRequest();
    res.status(200).json({ message: 'Request sent successfully.' });
  } catch (error) {
    console.error('Error sending request:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

app.get('/', (req, res) => {
  console.log('GET request received');
  res.sendStatus(200);
});

const port = 3000;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Define a cron job to run the sendRequest function every 15 minutes between 6 AM and 11 PM
cron.schedule('*/1 6-23 * * *', () => {
  sendRequest()
    .then(() => {
      console.log('Scheduled request sent successfully.');
    })
    .catch((error) => {
      console.error('Error sending scheduled request:', error);
    });
});

// Add the sendRequest function here
async function sendRequest() {
  try {
    const response = await axios.get('http://serverchat-v3qr.onrender.com/hello');
    console.log('Response Status:', response.status);
    console.log('Response Data:', response.data);
  } catch (error) {
    console.error('Error:', error.message);
  }
}
