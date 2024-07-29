import express from "express";
import "dotenv/config";
import axios from "axios";
import queryString from "query-string";
import tinify from "tinify";
import { PrismaClient } from "@prisma/client";
import { CronJob } from "cron";
import * as cheerio from "cheerio";
import { parse } from "dotenv";

import TelegramBot from 'node-telegram-bot-api';



const { PORT, TELEGRAM_TOKEN, SERVER_URL, TINIFY_API_KEY, SMART_GLOCAL_TOKEN } = process.env;
const app = express();
const prisma = new PrismaClient();

// TinyPng Configuration

tinify.key = TINIFY_API_KEY;

// Telegram API Configuration
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

app.use(express.json());

bot.on("callback_query", async (msg) => {
  console.log("callback_query", msg);
  if(msg.data) {
    const data = JSON.parse(msg.data);
    await bot.sendInvoice(msg.from.id, data);
  }
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const messageText = msg.text;

  if (messageText === "/start") {
    try {
      bot.sendMessage(chatId, `
          Welcome to the Dzrt Fast Bot. 
          type /register to register for the service
        `, {
        // reply_markup: {
        //   inline_keyboard: [
        //     [
        //       {
        //         text: "Register",
        //         // callback_data: "/register",
        //       },
        //     ],
        //   ],
        // },
      });
    } catch (error) {
      console.log(error.message);
    }
  }
  if (messageText === "/register") {
    try {
      await bot.sendInvoice(chatId, "Subscribe to Dzrt Fast", "Subscribe to Dzrt Fast", "dzrt-fast", SMART_GLOCAL_TOKEN, "SAR", [
        {
          label: "Subscribe",
          amount: 1000,
        },
      ]);
    } catch (error) {
      console.log(error.message);
    }
  }
});

bot.on("pre_checkout_query", async (msg) => {
  console.log("pre_checkout_query", msg);
  const chat_id = msg.from.id;
  const user = await prisma.user.findUnique({
    where: {
      chat_id: `${chat_id}`,
    },
  });
  if (user) {
    if (!user.paid) {
      await bot.answerPreCheckoutQuery(msg.id, true);;
    } else {
      await bot.answerPreCheckoutQuery(msg.id, false, {error_message: "User already paid"});
    }
  }
});

bot.on("successful_payment", async (msg) => {
  Promise.all([
    registerUser(msg.chat.id, `${msg.from.first_name} ${msg.from.last_name}`),
    addPaymentHistory(msg.chat.id, msg.successful_payment.total_amount)
  ]).then((values) => {
    console.log(values);
  }).catch((error) => {
    console.log(error);
  });
});


async function addPaymentHistory(chat_id, amount) {
  return new Promise(async (resolve, reject) => {
    try {
      await prisma.payment_history.create({
        data: {
          amount: amount,
          user_id: `${chat_id}`,
        },
      });
      resolve(true);
    } catch (error) {
      console.log(error.message);
      reject(false);
    }
  });
  
};


async function registerUser(chat_id, name) {
  return new Promise(async (resolve, reject) => {
    try {
      const userExists = await prisma.user.findUnique({
        where: {
          chat_id: `${chat_id}`,
        },
      });
      if (userExists) {
        await prisma.user.update({
          where: {
            chat_id: `${chat_id}`,
          },
          data: {
            subscribed_at: moment().format(),
            subscribtion_expire_at: moment().add(1, "month").format(),
          },
        });
        resolve(true);
      }
  
      await prisma.user.create({
        data: {
          name: name,
          chat_id: `${chat_id}`,
          subscribed_at: moment().format(),
        },
      });
      resolve(true);
    } catch (error) {
      console.log(error.message);
      reject(false);
    }
  });
}


CronJob.from({
  cronTime: "* */59 * * * *",
  onTick: async function () {
    // get all user who are paid and send them the stock
    const users = await prisma.user.findMany({
      where: {
        subscribed_at: true
      },
    });
    users.forEach(async (user) => {
      try {
        // load the dzrt website with axios then use cheerio to parse the html
        if(moment(user.subscribed_at).isAfter(moment(user.subscribtion_expire_at))) {
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
        } 
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
  } catch (error) {
    console.log(error.message);
  }
});
