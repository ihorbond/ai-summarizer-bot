require("dotenv").config();

import { Markup, Telegraf } from "telegraf";
import { Configuration, OpenAIApi } from "openai";
// import axios from "axios";
import fs from "fs";

const bot = new Telegraf(process.env.TELEGRAM_BOT_API_KEY!);

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

if (!fs.existsSync("chats.json")) {
  fs.writeFileSync("chats.json", JSON.stringify({}));
}

const memory = fs.readFileSync("chats.json").toString();
const parsedJson = JSON.parse(memory);
const entries = Object.entries(parsedJson);

const chats = new Map<string, { messages: Array<any> }>(entries as any);
// console.log(parsedJson, chats);

const tldr = (chatId: string): Promise<string> | string => {
  //   console.log(chats.has(chatId));

  if (!chats.has(chatId)) return "Chat not found";

  const messages = chats.get(chatId)?.messages ?? [];
  const sentences = formatMessages(messages);

  //   console.log(sentences);

  return openai
    .createCompletion({
      model: "text-davinci-003",
      prompt: `${sentences} tl;dr based on who said it with up to 3 bullet points per author. Skip greetings.`,
      temperature: 0.7,
      max_tokens: 60,
      top_p: 1.0,
      frequency_penalty: 0.0,
      presence_penalty: 1,
    })
    .then((res) => res.data.choices[0]?.text ?? "No response")
    .catch(({ response }) => {
      return `Error generating summary: ${
        response.status - response.statusText
      }`;
    });
};

const formatMessages = (messages: Array<any>): string => {
  return messages
    .map((msg) => {
      const { from: msgAuthor, text, repliedTo } = msg;
      const { firstName: recepient } = repliedTo;
      return `${msgAuthor} ${
        recepient ? ` replied to ${recepient}` : ""
      }: ${text}`;
    })
    .join(". ");
};

bot.start((ctx) => {
  ctx.reply("Hey, my name is Summo. I summarize text messages for you :)");
});

bot.help((ctx) => {
  ctx.replyWithHTML(`
        <b>Commands</b>
        1. /tldr - show summary
    `);
});

// bot.action("tldr", (_) => {
//   console.log("tldr action");
// });

bot.command("tldr", async (ctx) => {
  const chatId = ctx.update.message.chat.id.toString();
  const response = await tldr(chatId);
  //   console.log(response);
  ctx.reply(response);
});

bot.command("showMessages", async (ctx) => {
  const chatId = ctx.update.message.chat.id.toString();
  const response = chats.get(chatId)?.messages?.join("/n") ?? "";
  ctx.reply(response);
});

bot.on("text", (ctx) => {
  const { message } = ctx.update;
  const {
    message_id: messageId,
    reply_to_message: repliedTo,
    text,
    chat,
    from,
    date,
    entities,
  } = message;
  //   console.log(ctx);
  console.log(from.username, text);

  const newMessage = {
    id: messageId,
    text: text,
    from: from.first_name,
    timestamp: date,
    repliedTo: repliedTo
      ? {
          firstName: repliedTo.from?.first_name,
          username: repliedTo.from?.username,
        }
      : {},
  };

  const chatId = chat.id.toString();
  const currentMessages = chats.get(chatId)?.messages ?? [];
  chats.set(chatId, {
    messages: [...currentMessages, newMessage],
  });
});

bot.launch();

// tldr("530027140");

// Enable graceful stop
process.once("SIGINT", () => {
  bot.stop("SIGINT");
  const json = JSON.stringify(Object.fromEntries(chats), null, 2);
  fs.writeFileSync("chats.json", json);
});

process.once("SIGTERM", () => {
  bot.stop("SIGTERM");
  const json = JSON.stringify(Object.fromEntries(chats), null, 2);
  fs.writeFileSync("chats.json", json);
});
