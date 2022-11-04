const Discord = require('discord.js');
const secrets = require('./config/secrets');
const paginationEmbed = require('discord.js-pagination');
const fetch = require('node-fetch');
const User = require('./models/User');
const mongoose = require('mongoose');
const WsSf = require('ws-sf');

const bot = new Discord.Client();
const embed_color = "#F05A28";
mongoose
	.connect(secrets.mongodb_uri, {
		useNewUrlParser: true,
		useUnifiedTopology: true,
		useFindAndModify: false,
		useCreateIndex: true
	})
	.then(() => console.log("Database connected"))
    .catch(console.error);
mongoose.Promise = Promise;

bot.on('ready', () => {
	console.log(bot.user.tag + " is online");
	bot.user.setActivity("sf help", { type: "WATCHING" });
})
bot.on('message', msg => {
	if (msg.content.toLowerCase().startsWith(secrets.prefix) || (!msg.guild && !msg.author.bot))
		commandProcess(msg, !msg.guild);
});

const wssf = new WsSf(secrets.wssf_uri);
wssf.onrelease(data => {
	newRelease(data);
});

async function newRelease(data) {
	const release = JSON.parse(data);
	const embed = new Discord.MessageEmbed();
	embed
	.setColor(embed_color)
	.setTitle(release.manga.name + " - " + release.number)
	.setURL(`https://scantrad.net/mangas/${release.manga.id}/${release.number}`)
	.setThumbnail(release.manga.thumbnail)
	.addField("Le chapitre `" + release.number + "` de `" + release.manga.name + "` est sorti !", release.title)
	.setTimestamp()
	.setFooter("Merci de supporter la team en lisant sur le site !");

	const user_docs = await User.find({
		$and: [
			{ $or: [{ follows: release.manga.id }, { all: true }]},
			{ enabled: true }
		]
	}).catch(console.error);
	if (user_docs) {
		for (let user of user_docs) {
			bot.users.cache.get(user.id)
			.send("", embed)
			.catch(() => {});
		}
	}
}

function commandProcess(msg, dm) {
	let rawCommand = msg.content;
	let fullCommand = dm ? rawCommand : rawCommand.substr(secrets.prefix.length);
    let splitCommand = fullCommand.split(' ');
	splitCommand = splitCommand.filter(function(e){return e});
    let primaryCommand = splitCommand[0];
    let args = splitCommand.slice(1);

	switch (primaryCommand.toLowerCase()) {
		case 'help':
			showHelp(msg);
			break;

		case 'mangas': // show list of mangas
		fetch(secrets.sf_api.url+"mangas", {headers: new fetch.Headers({'Authorization': 'Bearer '+secrets.sf_api.token})})
		.then(response => response.json())
		.then(mangas => {
			if (mangas.error) console.error(mangas.error);
			let m = 0;
			let pages = [];
			let embed_str = "";
			if (mangas.length) {
				let p = -1;
				for (let manga of mangas) {
					if (m % 15 === 0) {
						if (p > -1)
							pages[p].addField("Liste des mangas :", embed_str);
						p++;
						embed_str = "";
						pages[p] = new Discord.MessageEmbed().setURL("https://scantrad.net").setTitle("Mangas").setTimestamp().setColor(embed_color);
					}
					m++;
					embed_str += "• "+manga.id+"\n";
				}
				pages[p].addField("Liste des mangas :", embed_str);
			} else pages.push(new Discord.MessageEmbed().setURL("https://scantrad.net").setTitle("Mangas").setTimestamp().setColor(embed_color).addField("‎", "Aucun manga"));
			paginationEmbed(msg, pages, ['⬅️', '➡️']).catch(console.error);
		})
		.catch(console.error);
			break;

		case 'followed': // show followed mangas
		User.findOne({ id: msg.author.id })
		.then(user_doc => {
			let m = 0;
			let pages = [];
			let embed_str = "";
			if (user_doc && user_doc.follows.length) {
				let p = -1;
				for (let manga_id of user_doc.follows) {
					if (m % 15 === 0) {
						if (p > -1)
							pages[p].addField("Liste des mangas suivis :", embed_str);
						p++;
						embed_str = "";
						pages[p] = new Discord.MessageEmbed().setURL("https://scantrad.net").setTitle("Mangas").setTimestamp().setColor(embed_color);
					}
					m++;
					embed_str += "• "+manga_id+"\n";
				}
				pages[p].addField("Liste des mangas suivis :", embed_str);
			} else pages = [ new Discord.MessageEmbed().setURL("https://scantrad.net").setTitle("Mangas").setTimestamp().setColor(embed_color).addField("Liste des mangas suivis :", "Aucun manga") ];
			if (user_doc && user_doc.all) pages = [ new Discord.MessageEmbed().setURL("https://scantrad.net").setTitle("Mangas").setTimestamp().setColor(embed_color).addField("Liste des mangas suivis :", "Tous les mangas") ];
			paginationEmbed(msg, pages).catch(console.error);
		})
		.catch(console.error);
			break;

		case 'all': // toggle follow all
			User
			.findOrCreate({ id: msg.author.id })
			.then(res => {
				let user_doc = res.doc;
				user_doc.all = !user_doc.all;
				user_doc
				.save()
				.then(() => {
					if (!user_doc.all && !user_doc.follows.length) User.deleteOne({ id: msg.author.id }).catch(console.error);
					msgReply(msg, user_doc.all ? "tu suis maintenant tous les mangas." : "tu ne suis désormais plus tous les mangas.").catch(console.error);
				})
				.catch(console.error);
			})
			.catch(console.error);
			break;

		case 'toggle': // toggle pings
			User
			.findOrCreate({ id: msg.author.id })
			.then(res => {
				let user_doc = res.doc;
				user_doc.enabled = !user_doc.enabled;
				user_doc
				.save()
				.then(() => {
					msgReply(msg, user_doc.enabled ? "tu recevras un ping à chaque nouvelle sortie !" : "tu ne seras plus notifié des nouvelles sorties.").catch(console.error);
				})
				.catch(console.error);
			})
			.catch(console.error);
			break;

		case 'follow': // follow mangas
			updateFollow(msg, args, true);
			break;

		case 'unfollow': // unfollow mangas
			updateFollow(msg, args, false);
			break;

		default:
			msgReply(msg, "cette commande n'existe pas.").catch(console.error);
	}
}

function showHelp(msg) {
	let embed = new Discord.MessageEmbed()
		.setThumbnail(bot.user.displayAvatarURL())
		.setURL("https://scantrad.net")
		.setTitle("Informations")
		.setDescription("Annonce la sortie de nouveaux chapitres de `https://scantrad.net`")
		.setTimestamp()
		.setColor(embed_color)
		.addFields(
			{ name: "Préfixe : `"+secrets.prefix+"`", value: "\n‎" },
			{ name: "Commandes :", value: "• `mangas` : Voir l'id des mangas\n• `followed` : Voir la liste des mangas suivis\n• `all` : Suivre tous les mangas et les nouveautés\n• `toggle` : Activer ou non les pings à chaque nouvelle sortie\n• `follow MANGA_ID...` : Suivre des mangas\n• `unfollow MANGA_ID...` : Ne plus suivre des mangas\n‎" }
		);
	msgSend(msg, "", embed).catch(console.error);
}

function updateFollow(msg, args, toFollow) {
	if (!args.length) { msgReply(msg, toFollow ? "choisis un ou des mangas à suivre." : "choisis un ou des mangas à ne plus suivre.").catch(console.error); return; }
	fetch(secrets.sf_api.url+"mangas", {headers: new fetch.Headers({'Authorization': 'Bearer '+secrets.sf_api.token})})
	.then(response => response.json())
	.then(async mangas => {
		let r = 0;
		for (let manga_id of args) {
			let found = (mangas.find(el => el.id === manga_id)) !== undefined;
			if (found) {
				let res;
				if (toFollow) {
					await User.findOrCreate({ id: msg.author.id });
					res = await User.updateOne({ id: msg.author.id }, { $push: { follows: manga_id } });
				} else
					res = await User.updateOne({ id: msg.author.id }, { $pull: { follows: manga_id } });
				if (res.nModified) r++;
			}
		}
		let str;
		if (toFollow) {
			if (r > 1)			str = "**"+r+"** mangas ont été ajoutés à tes mangas suivis.";
			else if (r === 1)	str = "**"+r+"** manga a été ajouté à tes mangas suivis.";
			else				str = "aucun manga n'a été ajouté à tes mangas suivis.";
		} else {
			if (r > 1)			str = "**"+r+"** mangas ont été supprimés de tes mangas suivis.";
			else if (r === 1)	str = "**"+r+"** manga a été supprimé de tes mangas suivis.";
			else				str = "aucun manga n'a été supprimé de tes mangas suivis.";
		}
		msgReply(msg, str).catch(console.error);
		if (!toFollow) User.findOneAndDelete({ id: msg.author.id, follows: [] }).catch(console.error);
	})
	.catch(console.error);
}

async function msgSend(msg, content, attachment) {
	return await msg.channel.send(content, attachment)
}
async function msgReply(msg, content) {
	return await msg.reply(msg.channel.type === "dm" ? capitalize(content) : content);
}
function capitalize(str) {
	return str.replace(/^\w/, (c) => c.toUpperCase());
}

bot.login(secrets.token).catch(console.error);
