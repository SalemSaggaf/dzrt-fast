import express from "express";
import "dotenv/config";
import axios from "axios";
import queryString from "query-string";
import tinify from "tinify";
import { PrismaClient } from "@prisma/client";
import { CronJob } from "cron";
import * as cheerio from "cheerio";
import { parse } from "dotenv";

const { PORT, TELEGRAM_TOKEN, SERVER_URL, TINIFY_API_KEY } = process.env;
const app = express();
const prisma = new PrismaClient();

// TinyPng Configuration

tinify.key = TINIFY_API_KEY;

// Telegram API Configuration
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const URI = `/webhook/${TELEGRAM_TOKEN}`;
const webhookURL = `${SERVER_URL}${URI}`;

app.use(express.json());

// configuring the bot via Telegram API to use our route below as webhook
const setupWebhook = async () => {
  try {
    const { data } = await axios.get(
      `${TELEGRAM_API}/setWebhook?url=${webhookURL}&drop_pending_updates=true`
    );

    console.log(data);
  } catch (error) {
    return error;
  }
};

// setup our webhook url route
app.post(URI, async (req, res) => {
  console.log(req.body);
  const data = req.body;
  if (data.message.text === "/start") {
    console.log("Bot is up and running");
    try {
      const response = await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: data.message.chat.id,
        text: `
          Welcome to the Dzrt Fast Bot. 
          type /register to register for the service
        `,
      });
    } catch (error) {
      console.log(error.message);
    }
  }
  if (data.message.text === "/register") {
    try {
      const response = registerUser(
        data.message.chat.id,
        data.message.from.first_name + " " + data.message.from.last_name
      );

      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: data.message.chat.id,
        text: `You have been successfully registered for the service`,
      });
    } catch (error) {
      console.log(error.message);
    }
  }
  /* 
    we need to respond back with 200 to let telegram know that we 
    have received the update. Failing to do so will result in telegram 
    not sending further updates after the first one.
  */
  res.status(200).send("ok");
});

async function registerUser(chat_id, name) {
  try {
    const user = await prisma.user.create({
      data: {
        name: name,
        chat_id: `${chat_id}`,
        paid: true,
      },
    });
    return user;
  } catch (error) {
    console.log(error.message);
  }
}

CronJob.from({
  cronTime: "* */59 * * * *",
  onTick: async function () {
    // get all user who are paid and send them the stock
    const users = await prisma.user.findMany({
      where: {
        paid: true,
      },
    });
    users.forEach(async (user) => {
      try {
        // load the dzrt website with axios then use cheerio to parse the html
        const website = await axios.get(
          "https://www.dzrt.com/ar/our-products.html"
        );
        const $ = await cheerio.load(website.data);

        $(".item.product.product-item.available").each(async (i, element) => {
            const productName = $(element).find(".product-item-link");
            await axios.post(`${TELEGRAM_API}/sendMessage`, {
              chat_id: user.chat_id,
              text: `Product ${productName} is available now`,
              parse_mode: "HTML",
            });
        });
      } catch (error) {
        console.log(error.message);
      }
    });
  },
  start: true,
  timeZone: "Asia/Riyadh",
});

app.listen(PORT, async () => {
  // setting up our webhook url on server spinup
  try {
    console.log(`Server is up and Running at PORT : ${PORT}`);
    await setupWebhook();
  } catch (error) {
    console.log(error.message);
  }
});
