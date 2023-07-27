// index.js

const axios = require('axios');
const Redis = require('ioredis');
require('dotenv').config();

const TOKEN = process.env.TOKEN;
const PAGE_ID = process.env.PAGE_ID;
const REDIS_URL = process.env.REDIS_URL;

// Create a Redis client with the connection using REDIS_URL
const redisClient = new Redis(REDIS_URL);

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
        message: { text: 'Hello, this is a test message!' }, // You can modify the message here
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
    const oneMinuteInMilliseconds = 60 * 1000; // 1 minute in milliseconds

    // Get the current date in milliseconds
    const currentDateInMs = Date.now();

    // Loop until SCAN returns '0' (end of iteration)
    do {
      // Use the SCAN command to get a batch of keys (numbers)
      const [newCursor, keys] = await redisClient.scan(cursor, 'MATCH', '*');

      // Update the cursor for the next iteration
      cursor = newCursor;

      // Send messages to each number (key) in the current batch
      for (const key of keys) {
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

          // If the time difference is greater than 1 minute, send the post request
          if (timeDifferenceInMs >= oneMinuteInMilliseconds) {
            const success = await sendMessage(fbid);
            if (success) {
              console.log(`Message sent successfully to fbid: ${fbid}`);
              // Delete the data related to fbid in Redis after sending the message successfully
              await redisClient.del(key); // Delete the key and its associated data
            } else {
              console.error(`Failed to send message to fbid: ${fbid}`);
            }
          } else {
            console.log(`Message for fbid: ${fbid} not sent. Receive date within 1 minute.`);
          }
        } catch (error) {
          console.error(`Error processing key: ${key}`, error);
        }
      }
    } while (cursor !== '0'); // Loop until the end of iteration

    // Reschedule the function to run again in one minute
    setTimeout(sendMessagesToNumbers, oneMinuteInMilliseconds);
  } catch (error) {
    console.error('Error sending messages:', error);
  }
}

// Start sending messages to all numbers every minute for testing
sendMessagesToNumbers();