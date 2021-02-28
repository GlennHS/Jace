require('dotenv').config();
const fs = require('fs');
const colors = require('colors');

const Discord = require('discord.js');
const client = new Discord.Client();

//#region D&D
const guilds = ["Selesnya", "Rakdos", "Simic", "Dimir", "Gruul", "Golgari", "Izzet", "Azorius", "Boros", "Orzhov"]

let lastRoll = {
  dice: 0,
  sides: 0,
  rolls: [],
  crits: 0,
  critFails: 0,
  total: 0,
  average: 0,
}

let monsters, spells, log;

const findMonster = (name) => {
  let o;
  name = name.toLowerCase();
  monsters.forEach((obj) => {
    let nameFind = obj["name"]
    if(nameFind.toLowerCase() == name) { o = obj; }
  });
  return o;
}

const makeNumLength5 = (num) => {
  const spaces = 5 - num.toString().length
  let lPad = ""
  let rPad = ""
  for(let i = 0; i < Math.floor(spaces/2); i++) { lPad += " ";}
  for(let i = 0; i < Math.ceil(spaces/2); i++) { rPad += " ";}
  return lPad + num.toString() + rPad
}

const prettifyAbilities = (m) => {
  let out = "";
  m.special_abilities.forEach((a) => {
    let abilityText = "";
    abilityText += `**${a.name}**\n`;
    abilityText += `Desc: ${a.desc}\n`;
    out += abilityText;
  })
  return out
}

const prettifyActions = (m) => {
  let out = "";
  m.actions.forEach((a) => {
    let abilityText = "";
    abilityText += `**${a.name}**\n`;
    abilityText += `Desc: ${a.desc}\n`;
    abilityText += `+${a.attack_bonus} to hit, ${a.damage_dice} + ${a.damage_bonus}\n`;
    out += abilityText;
  })
  return out
}

const prettifyStats = (m) => {
  const s = {
    str: makeNumLength5(m.strength),
    dex: makeNumLength5(m.dexterity),
    con: makeNumLength5(m.constitution),
    wis: makeNumLength5(m.wisdom),
    int: makeNumLength5(m.intelligence),
    cha: makeNumLength5(m.charisma)
  }
  return `\`\`\`
+-----+-----+-----+-----+-----+-----+
| STR | DEX | CON | WIS | INT | CHA |
+-----+-----+-----+-----+-----+-----+
|${s.str}|${s.dex}|${s.con}|${s.wis}|${s.int}|${s.cha}|
+-----+-----+-----+-----+-----+-----+ \`\`\``
}

const prettifyMonster = (m) => {
  let out = `**Name:** ${m.name}  **CR:** ${m.challenge_rating}  **HP:** ${m.hit_points}
  **Type:** ${m.type}  **Subtype:** ${m.subtype}
  **Senses:** ${m.senses}  **Languages:** ${m.languages}
  Stats:
  ${prettifyStats(m)}
  Special Abilities:
  ${prettifyAbilities(m)}
  Actions:
  ${prettifyActions(m)}
  `
  if(out.length < 1900) { return out; }
  else { 
    out = out.slice(0, 1900) + "\n\n**TEXT TOO LONG**";
    return out
  }
}

const findSpell = (name) => {
  let o;
  name = name.toLowerCase();
  spells.forEach((obj) => {
    let nameFind = obj["name"]
    if(nameFind.toLowerCase() == name) { o = obj; }
  });
  return o;
}

const prettifySpell = (s) => {
  s["class_list"] = s["class_list"].join(", ");
  return `
  **Casting Time:** ${s.casting_time}
  **Components:** ${s.components}
  **Description:** ${s.description}
  **Duration:** ${s.duration}
  **Level:** ${s.level}
  **Range:** ${s.range}
  **School:** ${s.school}
  **Is Ritual?** ${s.ritual ? "Yes" : "No"}
  **Class_list:** ${S.class_list}
  `;
}
//#endregion

//#region Log Functionality
const retrieveLog = () => {
  fs.readFile('./utils/log.json', 'utf8', (err, jsonString) => {
    if (err) {
      console.log("Error reading log from disk:", err)
      return
    }
    try {
      log = JSON.parse(jsonString);
      console.log("Log retrieved successfully");
    } catch(e) { console.error(e); errored = true; }
  });
}

const updateLog = () => {
  fs.writeFile('./utils/log.json', JSON.stringify(log), (err) => { if(err) { console.error(err); }})
}
//#endregion

//#region Startup and Disconnect
const initialiseBot = () => {
  fs.readFile('./utils/Monsters.json', 'utf8', (err, jsonString) => {
    if (err) {
        console.log("Error reading monsters from disk:", err)
        return
    }
    try {
        monsters = JSON.parse(jsonString);
    } catch(e) {console.error(e); }
  });
  fs.readFile('./utils/Spells.json', 'utf8', (err, jsonString) => {
    if (err) {
        console.log("Error reading spells from disk:", err)
        return
    }
    try {
        spells = JSON.parse(jsonString);
    } catch(e) {console.error(e); }
  });
  retrieveLog();
  // console.log(log);
  client.login(process.env.TOKEN);
}

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('disconnect', () => { updateLog(); })
//#endregion

client.on('message', msg => {
  if(!msg.author.tag !== process.env.BOT_ID) {
    try {
      //#region Rolling
      /**
       * Functionality Checklist
       * -Mark Crits With '!' and Crit Fails With '?!'
       *    =If a roll's total is its maximum/minimum possible, make this clear with a symbol
       *    =E.g. #roll1d20 => You rolled 1?!
       * -Advantage/Disadvantage Rolls => A/D
       *    =Make a roll with advantage or disadvantage
       *    =E.g. #roll1d20A => You rolled 17
       *          #rinfo => You rolled 6 and 17, with advantage that's 17
       * -TODO: Crit Mode => C
       *    =Count crits
       *    =Count crit fails
       *    =Count (crits)-(crit fails)
       *    E.g. #roll3d4C => [1, 2, 4, 4] => You rolled 2 crits and 1 crit fail. Your critical difference was +1
       * -TODO: Keep Low/High Mode => L/H
       *    =Count only dice above the average for that dice
       *    =E.g. #roll6d6L => [1, 1, 2, 3, 4, 6] => [1, 1, 2, 3] => "4 of your 6 rolls were below average. These were 1,1,2,3 for a total of 7"
       *    =E.g. #roll6d6H => [1, 2, 2, 4, 5, 6] => [4, 5, 6] => "3 of your 6 rolls were above average. These were 4,5,6 for a total of 15"
       * -TODO: Named Rolls =Name
       *    =Declare a roll's purpose/intent
       *    =E.g. #roll1d20=Stealth => You rolled a 17 (Stealth)
       * -TODO: Stat Rolls +/- X
       *    =Add or subtract a number from a roll's result
       *    =E.g. #roll2d6+4 => [1, 4] + 4 => You rolled 5 + 4 => 9
       * -TODO: Combination Rolls
       *    =Mix up everything above (Good God I must hate myself)
       *    =E.g. #roll4d6H+7=Bow of Null Errors Damage => You rolled 22  (Bow of Null Errors)
       *          #rinfo => You rolled [2, 4, 5, 6], keep high = 15, 15 + 7 = 22
       */
      const rollRegex = /j!roll\s?(\d+)d(\d+)\s?([\+\-]\d+)?\s?([AD]?[CHL]?)?(=.+)?/gi;
      if (rollRegex.test(msg.content)) {
        //#region Old Code
        lastRoll.critFails = 0;
        lastRoll.crits = 0;
        lastRoll.rolls = [];
        let dice, sides;
        [dice, sides] = msg.content.match(/\d+/g);
        if(dice < 100000 && sides < 100000) {
          lastRoll.dice = dice;
          lastRoll.sides = sides;
          let result = 0;
          for(let i = 0; i < dice; i++) {
            roll = Math.ceil(Math.random() * sides);
            if(roll == sides) {lastRoll.crits += 1; }
            if(roll == 1) {lastRoll.critFails += 1; }
            lastRoll.rolls.push(roll);
            result += roll;
          }
          lastRoll.total = result;
          lastRoll.average = result/dice;
          msg.reply(`Rolled ${result}`);
        } else {
          msg.reply("Format XdY where both X and Y are less than 100000 smoothbrain");
        }
        //#endregion
      }

      if (/j!rinfo/gi.test(msg.content)) {
        msg.channel.send(`The last roll was ${lastRoll.dice}d${lastRoll.sides}\nYou rolled ${lastRoll.rolls.sort(((a, b) => a - b)).join(", ")}\n You had ${lastRoll.crits} crits and ${lastRoll.critFails} crit fails\nYour average roll was ${lastRoll.average}`);
      }
      //#endregion

      //Choose random guild
      if(msg.content.toLowerCase() == "j!guild") {
        const r = Math.floor(Math.random() * guilds.length)
        const chosenGuild = guilds[r];
        const guildEmote = client.emojis.find(emoji => emoji.name === `${chosenGuild}_Logo`);
        msg.channel.send(`The best guild is clearly ${chosenGuild} ${guildEmote}`);
        log.guildPicks[chosenGuild] += 1;
      }

      //Get guild pick stats
      if(msg.content.toLowerCase() == "j!gstats") {
        retrieveLog();
        msg.reply(`\n` + JSON.stringify(log.guildPicks).slice(1, -1).replace(/"/gi, "").replace(/,/gi, "\n"));
      }

      //Find monster
      if(/j!monster\s[\w\s\-']+/gi.test(msg.content)) {
        const monsterToFind = msg.content.slice(10);
        let monster = findMonster(monsterToFind);
        try {
          const monsterEmbed = new Discord.RichEmbed()
          .setTitle(`Name: ${monsterToFind}`)
          .setColor(0x9820bc)
          .setDescription(prettifyMonster(monster));
          msg.author.send(monsterEmbed);
          //msg.channel.send(monsterEmbed); //ENABLE ME TO PUT MONSTER IN CHANNEL
        } catch(e) {
          msg.reply("Couldn't find that one, sorry!");
          console.log(`Tried to find monster: ${monsterToFind}`.red);
        }
      }

      //Find Spell
      if(/j!spell\s[\w\s\-']+/gi.test(msg.content)) {
        const spellToFind = msg.content.slice(8);
        let spell = findSpell(spellToFind);
        try {
          const spellEmbed = new Discord.RichEmbed()
          .setTitle(`Name: ${spellToFind}`)
          .setColor(0x6718dc)
          .setDescription(prettifySpell(spell));
          msg.author.send(spellEmbed);
          //msg.channel.send(spellEmbed); //ENABLE ME TO PUT SPELL IN CHANNEL
        } catch(e) {
          msg.reply("Couldn't find that one, sorry!");
          console.log(`Tried to find spell: ${spellToFind}`.red);
        }
      }

      //Clear messages
      if (/j!clear\s\d+/gi.test(msg.content) && msg.author.tag === process.env.GLENN_ID) {
        try {
          let numToDelete = parseInt(msg.content.split(" ")[1]) + 1;
          msg.channel.bulkDelete(numToDelete);
        }
        catch(e) {console.error(e)};
      }

      if (msg.content == "j!update" && msg.author.tag === process.env.GLENN_ID) {
        try {
          updateLog();
          msg.reply("All sorted!")
        }
        catch(e) {console.error(e); msg.reply("Something went wrong, do it manually..."); };
      }
    } catch(err) {
      console.error(err);
      updateLog();
    }
  }
});

initialiseBot();