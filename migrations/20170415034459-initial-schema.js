exports.up = knex =>
  knex.schema
    .createTable('Champion', (table) => {
      table.integer('id').unsigned().primary();
      table.string('key').unique();
      table.string('name');
      table.enu('role1', ['fighter', 'marksman', 'support', 'assassin', 'mage', 'tank']);
      table.enu('role2', ['fighter', 'marksman', 'support', 'assassin', 'mage', 'tank']);
    })
    .createTable('Objective', (table) => {
      table.increments('id').primary();
      table.string('key').unique();
      table.string('title');
    })
    .createTable('Summoner', (table) => {
      table.integer('id').primary();
      table.string('summonerName');
      table.integer('profileIconId');
      table.integer('level');
    })
    .createTable('User', (table) => {
      table.increments('id').primary();
      table.string('username').unique();
      table.string('email').unique();
      table.string('password');
      table.integer('summonerId').unsigned().references('id').inTable('Summoner');
      table.integer('accountId').unsigned();
      table.uuid('verificationId');
      table.boolean('verified');
      table.index('username');
      table.boolean('assassin');
      table.boolean('mage');
      table.boolean('support');
      table.boolean('fighter');
      table.boolean('tank');
      table.boolean('marksman');
    })
    .createTable('Quest', (table) => {
      table.increments('id').primary();
      table.integer('type').unsigned();
      table.string('title');
      table.integer('championId').unsigned().references('id').inTable('Champion');
      table.json('points').unsigned();
    })
    .createTable('QuestObjective', (table) => {
      table.increments('id').primary();
      table.integer('questId').unsigned().references('id').inTable('Quest');
      table.integer('objectiveId').unsigned().references('id').inTable('Objective')
        .onDelete('CASCADE');
      table.integer('goalType').unsigned();
      table.integer('goal').unsigned();
    })
    .createTable('UserQuest', (table) => {
      table.increments('id').primary();
      table.integer('questId').unsigned().references('id').inTable('Quest');
      table.integer('userId').unsigned().references('id').inTable('User');
      table.boolean('active').default(false);
      table.boolean('completed').default(false);
      table.timestamp('activationDate');
    })
    .createTable('UserMatch', (table) => {
      table.bigInteger('id').unsigned().primary();
      table.integer('userId').unsigned().references('id').inTable('User')
        .onDelete('CASCADE');
    })
    .createTable('UserQuestObjective', (table) => {
      table.increments('id').primary();
      table.integer('questObjectiveId').unsigned().references('id').inTable('QuestObjective');
      table.integer('userQuestId').unsigned().references('id').inTable('UserQuest')
        .onDelete('CASCADE');
      table.integer('progress');
    });

exports.down = knex =>
  knex.schema
    .dropTableIfExists('UserQuestObjective')
    .dropTableIfExists('UserQuest')
    .dropTableIfExists('UserMatch')
    .dropTableIfExists('User')
    .dropTableIfExists('Summoner')
    .dropTableIfExists('QuestObjective')
    .dropTableIfExists('Quest')
    .dropTableIfExists('Objective')
    .dropTableIfExists('Champion');
