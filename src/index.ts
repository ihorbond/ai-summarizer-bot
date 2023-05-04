require("dotenv").config();

import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { Configuration, OpenAIApi } from "openai";
import fs from "fs";

const { TELEGRAM_BOT_API_KEY, OPENAI_API_KEY } = process.env;

const bot = new Telegraf(TELEGRAM_BOT_API_KEY!);

const configuration = new Configuration({
  apiKey: OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

if (!fs.existsSync("chats.json")) {
  fs.writeFileSync("chats.json", JSON.stringify({}));
}

const database = fs.readFileSync("chats.json").toString();
const parsedJson = JSON.parse(database);
const entries = Object.entries(parsedJson);

const chats = new Map<string, { messages: Array<any> }>(entries as any);
// console.log(parsedJson, chats);

const saveToFile = (fileName: string = "chats.json") => {
  const json = JSON.stringify(Object.fromEntries(chats), null, 2);
  fs.writeFileSync(fileName, json);
};

try {
  const tldr = (chatId: string): Promise<string> | string => {
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

  const formatMessages = (
    messages: Array<any>,
    separator: string = ". "
  ): string => {
    return messages
      .map((msg) => {
        const { from: msgAuthor, text, repliedTo } = msg;
        const { firstName: recepient } = repliedTo;
        return `${msgAuthor} ${
          recepient ? `replied to ${recepient}` : ""
        }: ${text}`;
      })
      .join(separator);
  };

  bot.start((ctx) => {
    ctx.reply("Hey, my name is Summo. I summarize text messages for you :)");
  });

  bot.help((ctx) => {
    ctx.replyWithHTML(`
        <b>Commands</b>
        1. /tldr - show summary
        2. /showMessages - message history
    `);
  });

  bot.command("tldr", async (ctx) => {
    const chatId = ctx.update.message.chat.id.toString();
    const response = await tldr(chatId);
    //   console.log(response);
    ctx.reply(response || "No response from ChatGPT");
  });

  bot.command("showMessages", (ctx) => {
    const chatId = ctx.update.message.chat.id.toString();
    const messages = chats.get(chatId)?.messages ?? [];
    const result = formatMessages(messages, "\n") || "No messages";
    //   console.log("showMessages", result);
    ctx.reply(result);
  });

  // https://telegraf.js.org/classes/Telegraf-1.html#on-3
  bot.on("edited_message", (ctx) => {
    const { chat, message_id: id, text } = ctx.update.edited_message as any;
    const chatId = chat.id.toString();
    const messages = chats.get(chatId)?.messages ?? [];
    const messageToUpdate = messages.find((m) => m.id === id);
    if (messageToUpdate) {
      messageToUpdate.text = text;
    }
  });

  bot.on(message("chat_shared"), (ctx) => {
    console.log("chat_shared", ctx);
  });

  bot.on("my_chat_member", (ctx) => {
    //   console.log("my_chat_member", ctx);
    const { new_chat_member: me, chat } = ctx.update.my_chat_member;
    if (me.status === "left" || me.status === "kicked") {
      // delete messages
      // chats.delete(chat.id.toString())
    }
  });

  bot.on(message("text"), (ctx) => {
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
} catch (err) {
  console.error(err);
  saveToFile();
}

// Enable graceful stop
process.once("SIGINT", () => {
  bot.stop("SIGINT");
  saveToFile();
});

process.once("SIGTERM", () => {
  bot.stop("SIGTERM");
  saveToFile();
});
