const config       = require('./config');
const mongo        = require('./db');
const Telegraf     = require('telegraf');
const commandParts = require('telegraf-command-parts');

const BOT_TOKEN = config('telegram').token;
if (!BOT_TOKEN)
	return;

const bot = new Telegraf(BOT_TOKEN);

bot.use(commandParts());

bot.command('subscribe', (ctx) => {
	let requestedMunicipality = ctx.state.command.args.toUpperCase();
	if (requestedMunicipality) {
		mongo.db.telegram.update({ chatId: ctx.message.chat.id }, { chatId: ctx.message.chat.id, requestedMunicipality: requestedMunicipality }, { upsert: true });
		return ctx.replyWithMarkdown(`Ricevuto! Appena ci saranno delle novità riguardanti il comune di *${requestedMunicipality}* sarai il primo ad esserne messo al corrente 👍🏻\n\nQuando vuoi smettere, invia il comando _/unsubscribe_`);
	}
});
bot.command('unsubscribe', (ctx) => {
	mongo.db.telegram.find({ chatId: ctx.message.chat.id }).limit(1, (err, users) => {
		if (err || !users || users.length == 0)
			return;

		mongo.db.telegram.remove({ chatId: ctx.message.chat.id });

		if (users[0].requestedMunicipality)
			return ctx.replyWithMarkdown(`Ok, non riceverai più aggiornamenti riguardanti *${users[0].requestedMunicipality}* 🛑✋🏻`);
	});
});

bot.on('text', (ctx) => {
	return ctx.replyWithMarkdown(`Ciao *${ctx.message.from.username}*!\nPosso informarti dei cambiamenti che avvengono al [database dei cabinet FTTC](${config('telegram').site_link}) riguardanti un determinato luogo.\n\nPer cominciare, esegui il comando:\n/subscribe _nome del comune interessato_`);
});

bot.launch();

module.exports = bot;
