const { Sequelize } = require('sequelize');
const config = require('./config');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

const sequelize = dbConfig.use_env_variable
  ? new Sequelize(process.env[dbConfig.use_env_variable], { logging: false, ...dbConfig })
  : new Sequelize({ logging: false, ...dbConfig });

module.exports = sequelize;
