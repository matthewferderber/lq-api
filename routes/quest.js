const UserQuest = require('../models/user_quest');
const Quest = require('../models/quest');
const User = require('../models/user');
const UserQuestObjective = require('../models/user_quest_objective');
const util = require('../util');
const UserMatch = require('../models/user_match');
const Champion = require('../models/champion');

const api = util.api;

// Creates a flattened quest object
function createQuestResponse(quests) {
  return quests.map(q => ({
    id: q.id,
    title: q.quest.title,
    championId: q.quest.championId,
    championKey: q.quest.champion.key,
    championName: q.quest.champion.name,
    type: q.quest.type,
    active: q.active,
    points: q.quest.points,
    completed: q.completed,
    objectives: q.objectives.map(o => ({
      progress: o.progress,
      goal: o.objective.goal,
      goalType: o.objective.goalType,
      title: o.objective.objective.title,
    })),
  }));
}
function getParticipantData(id, champion, game) {
  if (game.participantIdentities[0].player) {
    const identity = game.participantIdentities
      .find(participant => participant.player.accountId === id);
    return game.participants.find(p => identity.participantId === p.participantId);
  }
  return game.participants.find(p => p.championId === champion);
}
// Create array of strings representing users role preference
function createRolesArray(user) {
  const roles = [];
  if (user.assassin) roles.push('assassin');
  if (user.marksman) roles.push('marksman');
  if (user.support) roles.push('support');
  if (user.fighter) roles.push('fighter');
  if (user.tank) roles.push('tank');
  if (user.mage) roles.push('mage');
  return roles;
}
// Finds 3 (or fewer) new quests for a user
async function getNewQuests(id) {
  const user = await User.query().findById(id).eager('[quests.quest]');
  const userQuests = user.quests;
  const roles = createRolesArray(user);
  // Get champions that fit the users role preferences
  const champions = await Champion.query()
    .whereIn('role1', roles)
    .orWhereIn('role2', roles)
    .then(champs => champs.map(c => c.id));
  const currentQuests = [];
  let numOffered = 0;
  let numActive = 0;
  for (let i = 0; i < userQuests.length; i++) {
    currentQuests.push(userQuests[i].questId); // Fill with questIds for query
    if (!userQuests[i].active) { numOffered++; }
    if (userQuests[i].active && !userQuests[i].completed) numActive++;
  }
  if (numOffered === 0 && numActive < 5) {
    // Find quests that user is not already doing
    return Quest.query()
      .whereNotIn('id', currentQuests)
      .whereIn('championId', champions)
      .eager('[objectives]')
      .then((quests) => {
        const newQuests = [];
        let rand;
        let upperLimit;
        if (quests.length > 3) {
          // Get random position in available quests (3 away from length)
          rand = Math.floor(Math.random() * (quests.length - 3));
          // Only use 3 quests
          upperLimit = rand + 3;
        } else {
          rand = 0;
          upperLimit = quests.length;
        }
        for (let i = rand; i < upperLimit; i++) {
          const questObjectives = [];
          // Create userQuestObjective array for userQuest
          for (let j = 0; j < quests[j].objectives.length; j++) {
            const obj = quests[i].objectives[j];
            questObjectives.push({ questObjectiveId: obj.id, progress: 0 });
          }
          newQuests.push({
            questId: quests[i].id,
            userId: id,
            completed: false,
            active: false,
            objectives: questObjectives,
          });
        }
        return newQuests;
      });
  }
  return null;
}

// Routes
const self = {
  offerQuests: async (ctx) => {
    // Return 3 new quests
    ctx.body = await getNewQuests(ctx.user.id)
      .then(quests => (quests ? UserQuest.query().insertGraph(quests) : null))
      .then(() => UserQuest
        .query()
        .where('userId', '=', ctx.user.id)
        .andWhere('active', '=', false)
        .eager('[objectives.[objective.objective], quest.champion]'))
      .then(quests => createQuestResponse(quests))
      .catch(err => console.error(err));
  },
  activateQuest: async (ctx, id) => {
    // Return newly activated quest
    ctx.body = await UserQuest.query()
      .where('userId', '=', ctx.user.id)
      .eager('[objectives.[objective.objective], quest.champion]')
      .patchAndFetchById(id, { active: true, activationDate: new Date().toUTCString() })
      .then(quest => createQuestResponse([quest])[0])
      .catch(err => console.error(err));
    // Delete all other quest offers
    await UserQuest
      .query()
      .delete()
      .where('userId', '=', ctx.user.id)
      .andWhere('active', '=', false)
      .then()
      .catch(err => console.error(err));
  },
  allQuests: async (ctx) => {
    // Return all quests (in progress or completed) for the given user
    await self.offerQuests(ctx);
    ctx.body = await UserQuest.query()
      .eager('[objectives.[objective.objective], quest.champion]')
      .where('userId', '=', ctx.user.id)
      .then(quests => createQuestResponse(quests));
  },
  updateQuests: async (ctx) => {
    const user = await User.query()
      .eager('[quests.[quest, objectives.objective.objective], matches]')
      .findById(ctx.user.id);
    const recentMatches = await api.Match.gettingRecentListByAccount(user.accountId)
      .then((res) => {
        const matches = res.matches;
        // Filters to matches that occured AFTER the quest was activated
        const validMatches = matches
          .filter(match => user.matches.find(m => m.id === match.gameId) === undefined
          && user.quests.some(quest => Date.parse(quest.activationDate) > match.timestamp &&
            quest.quest.championId === match.champion));
        return validMatches;
      });

    // Map gameID to champion because normal games are missing participantIdentities
    const gameChampMap = new Map();
    recentMatches.forEach(match => gameChampMap.set(match.gameId, match.champion));

    const matchPromises = [];
    const userMatches = [];
    // Create promise array of match requests
    for (let i = 0; i < recentMatches.length; i++) {
      userMatches.push({ id: recentMatches[i].gameId, userId: ctx.user.id });
      matchPromises.push(api.Match.gettingById(recentMatches[i].gameId));
    }
    // Add all of the used matches to UserMatches
    UserMatch.query().insert(userMatches).then();
    await Promise.all(matchPromises)
      // Get players data from the matches
      .then(matches => matches.map(match =>
        getParticipantData(user.accountId, gameChampMap.get(match.gameId), match)))
      .then((matches) => {
        // Get quests that have progressed
        const progressedQuests = user.quests
          .filter(q => matches.some(match => match.championId === q.quest.championId));
        for (let i = 0; i < progressedQuests.length; i++) {
          const quest = progressedQuests[i];
          // Filter applicable matches per quest
          const applicableMatches = matches
            .filter(match => match.championId === quest.quest.championId);
          for (let j = 0; j < quest.objectives.length; j++) {
            const qObjective = quest.objectives[j].objective; // QuestObjective
            // Add applicable statistic to objective progress
            quest.objectives[j].progress += applicableMatches
              .reduce((acc, match) => acc + match.stats[qObjective.objective.key], 0);
            if (quest.objectives[j].progress > qObjective.goal) {
              quest.objectives[j].progress = qObjective.goal;
            }
            UserQuestObjective.query()
              .findById(quest.objectives[j].id)
              .patch({ progress: quest.objectives[j].progress }).then();
          }
          // If all objectives are completed, mark the quest as completed
          if (quest.objectives.every(o => o.progress === o.objective.goal) && !quest.completed) {
            UserQuest.query()
              .findById(quest.id)
              .patch({ completed: true }).then();
          }
        }
        return user.quests;
      }).then(() => self.allQuests(ctx))
      .catch((err) => { console.error(err); ctx.status = 500; });
  },

};
module.exports = self;
